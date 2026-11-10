import { listen } from "@tauri-apps/api/event";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./RecordingOverlay.css";
import { commands, events } from "@/bindings";
import { usePresence } from "@/hooks/usePresence";
import type {
  Notice,
  StreamPhase,
  StreamPhaseEvent,
  StreamTextEvent,
  StreamWorkKind,
} from "@/bindings";
import { NoticeBadgeIcon } from "@/components/icons/NoticeBadgeIcon";
import i18n, { syncLanguageFromSettings } from "@/i18n";
import { noticeDisplay } from "@/lib/notices";
import type { ModelStateEvent } from "@/lib/types/events";
import { getLanguageDirection } from "@/lib/utils/rtl";

type OverlayState =
  | "recording"
  | "streaming"
  | "transcribing"
  | "processing"
  | "recovery"
  | "notice"
  | "live_notice";

const isNoticeState = (state: OverlayState) =>
  state === "notice" || state === "live_notice";

// Number of reactive bars in the waveform (the simple, smoothed style shared by
// every overlay form). Mic levels arrive as 16 FFT buckets; we take the first N.
const WAVE_BARS = 9;
// 24 fixed bars (the .swave width) that react live. Each reads one voice
// bucket, scrambled so neighbours differ, under a hump so the middle rises most.
const WAVE_COUNT = 24;
const BAR_BUCKET = Array.from(
  { length: WAVE_COUNT },
  (_, i) => (i * 5) % WAVE_BARS,
);
const BAR_HUMP = Array.from(
  { length: WAVE_COUNT },
  (_, i) => 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / WAVE_COUNT),
);
const SILENT_BARS = Array<number>(WAVE_COUNT).fill(0);
// Floor 1 makes the first sample set the floor.
const freshRange = () => ({ floor: 1, peak: 0 });

// Only call out a model load in the Live preview once it has run this long.
// Warm loads finish in well under this (~0.2s on Apple Silicon, ~1.5s on a
// Windows CPU backend), so the common case never flashes a loading notice while
// the user is speaking; cold loads can take 40s+.
const SLOW_MODEL_LOAD_MS = 2000;

// How long the paste-recovery card stays up; resting the pointer on it holds it.
// Time to click the target field first, then the row.
const RECOVERY_VISIBLE_MS = 20000;

type RecoveryPayload = { labels: string[]; lost: boolean };

// Matches the delay in `hide_recording_overlay`, so a notice can fade out.
const OVERLAY_FADE_MS = 300;

// 13px padding on each side, the 16px badge and its 7px gap.
const NOTICE_PILL_CHROME = 49;

const RecordingOverlay: React.FC = () => {
  const { t } = useTranslation();
  const [isVisible, setIsVisible] = useState(false);
  // Exit must end before `hide_recording_overlay` unmaps the window (OVERLAY_FADE_MS).
  const pill = usePresence(isVisible, 220);
  const [state, setState] = useState<OverlayState>("recording");
  // `Stream::play()` returning does not mean hardware callbacks are flowing.
  // Stay visually in an arming state until the backend processes the first
  // actual microphone sample chunk.
  const [captureReady, setCaptureReady] = useState(false);
  // Recording starts while the model loads in the background. Say so, otherwise
  // a cold start looks like an empty Live preview that ignores speech, then a
  // hung "Transcribing..." spinner. Once recording stops, any in-flight load is
  // the wait, so the working label reflects it immediately; the Live notice
  // waits for the load to be slow so fast loads don't flash it mid-speech.
  const [modelLoading, setModelLoading] = useState(false);
  const [modelLoadSlow, setModelLoadSlow] = useState(false);
  const modelLoadTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Latched per Live session: once the loading notice has opened the panel, keep
  // it open after the load so it doesn't collapse and reopen when text arrives.
  const [loadNoticeShown, setLoadNoticeShown] = useState(false);
  const [bars, setBars] = useState(SILENT_BARS);
  const [streamText, setStreamText] = useState<StreamTextEvent>({
    committed: "",
    tentative: "",
  });
  const [phase, setPhase] = useState<StreamPhase>("listening");
  const [workKind, setWorkKind] = useState<StreamWorkKind>("transcribing");
  const [elapsed, setElapsed] = useState(0);
  // Bumped on each new streaming session so the Live card remounts fresh (replays
  // the pop-in, and never animates in from the previous panel's open size).
  const [session, setSession] = useState(0);
  // Overlay placement (top vs bottom of the screen). The Live panel grows downward
  // from a top overlay (oldest line under the pill) and upward from a bottom one.
  const [position, setPosition] = useState<"top" | "bottom">("bottom");
  // True once live text overflows the cap. A top overlay fades its top edge only
  // while overflowing, so the resting first line stays crisp flush under the pill.
  const [overflowing, setOverflowing] = useState(false);
  // Recent transcripts offered back (see show_paste_recovery); `lost` means
  // the first one is a paste that didn't land.
  const [recovery, setRecovery] = useState<RecoveryPayload>({
    labels: [],
    lost: false,
  });
  const [recoveryHeld, setRecoveryHeld] = useState(false);
  const [hoverRow, setHoverRow] = useState(-1);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [noticeWidth, setNoticeWidth] = useState<number>();
  const noticeProbeRef = useRef<HTMLSpanElement>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const smoothedLevelsRef = useRef<number[]>(Array(16).fill(0));
  const rangeRef = useRef(freshRange());
  // Live-text scroll-back: the text region "sticks" to the newest line while the
  // user is at the bottom; if they scroll up to read history, auto-follow pauses
  // until they scroll back down.
  const capRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const direction = getLanguageDirection(i18n.language);

  useEffect(() => {
    const setupEventListeners = async () => {
      const unlistenNotice = await listen<Notice>("overlay-notice", (event) => {
        clearTimeout(fadeTimerRef.current);
        setNotice(event.payload);
      });

      const unlistenShow = await listen("show-overlay", async (event) => {
        const overlayState = event.payload as OverlayState;
        clearTimeout(fadeTimerRef.current);
        if (!isNoticeState(overlayState)) setNotice(null);
        // Reset synchronously before settings I/O. A fast microphone can emit
        // recording-ready while the awaits below are in flight; resetting after
        // them would overwrite that event and leave the overlay stuck arming.
        if (overlayState === "recording" || overlayState === "streaming") {
          setCaptureReady(false);
          smoothedLevelsRef.current = Array(16).fill(0);
          rangeRef.current = freshRange();
          setBars(SILENT_BARS);
          setStreamText({ committed: "", tentative: "" });
        }

        await syncLanguageFromSettings();
        // The Live panel flows downward from a top overlay and upward from a
        // bottom one; read the placement so the layout can flip to match.
        try {
          const settings = await commands.getAppSettings();
          if (settings.status === "ok") {
            setPosition(
              settings.data.overlay_position === "top" ? "top" : "bottom",
            );
          }
        } catch {
          // Keep the previous/default placement if settings can't be read.
        }
        setState(overlayState);
        if (overlayState === "streaming") {
          setPhase("listening");
          setWorkKind("transcribing");
          setElapsed(0);
          setLoadNoticeShown(false);
          setSession((s) => s + 1); // remount the card fresh for this session
        }
        setIsVisible(true);
      });

      const unlistenHide = await listen("hide-overlay", () => {
        setIsVisible(false);
        setCaptureReady(false);
        // A notice keeps rendering while it fades. Dropping the transcript here
        // stops a later notice from showing an old session's text.
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = setTimeout(() => {
          setNotice(null);
          setStreamText({ committed: "", tentative: "" });
        }, OVERLAY_FADE_MS);
      });

      const unlistenRecovery = await listen<RecoveryPayload>(
        "paste-recovery-texts",
        (event) => setRecovery(event.payload),
      );

      const unlistenReady = await listen("recording-ready", () => {
        setElapsed(0);
        setCaptureReady(true);
      });

      const unlistenLevel = await listen<number[]>("mic-level", (event) => {
        const newLevels = event.payload as number[];
        // Fast attack, quick release, so the bars follow the voice closely.
        // A fresh range seeds from the first sample, so the floor starts at room tone.
        const fresh = rangeRef.current.floor === 1;
        const smoothed = smoothedLevelsRef.current.map((prev, i) => {
          const target = newLevels[i] || 0;
          if (fresh) return target;
          return target > prev
            ? prev * 0.3 + target * 0.7
            : prev * 0.6 + target * 0.4;
        });
        smoothedLevelsRef.current = smoothed;
        // Self-calibrating range, so any mic fills the bars: the floor snaps
        // down to the quietest moment and drifts up; the peak jumps to the
        // loudest and decays over ~2 s. The 0.2 minimum span keeps room noise flat.
        const voice = smoothed.slice(0, WAVE_BARS);
        const loud = Math.max(...voice);
        const range = rangeRef.current;
        range.floor =
          loud < range.floor ? loud : range.floor + (loud - range.floor) * 0.02;
        range.peak = Math.max(loud, range.peak * 0.985, range.floor + 0.2);
        const span = range.peak - range.floor;
        setBars(
          BAR_BUCKET.map(
            (b, i) =>
              Math.min(1, Math.max(0, (voice[b] - range.floor - 0.03) / span)) *
              BAR_HUMP[i],
          ),
        );
      });

      const unlistenStream = await events.streamTextEvent.listen((event) => {
        setStreamText(event.payload);
      });

      const unlistenPhase = await events.streamPhaseEvent.listen((event) => {
        const payload: StreamPhaseEvent = event.payload;
        setPhase(payload.phase);
        if (payload.kind) setWorkKind(payload.kind);
      });

      // The backend ends every `loading_started` with exactly one of completed
      // or failed, so only those end a load. Other events (e.g. `unloaded` from
      // the idle watcher) aren't ordered against an in-flight load and must not
      // clear it.
      const unlistenModel = await listen<ModelStateEvent>(
        "model-state-changed",
        (event) => {
          const type = event.payload.event_type;
          if (type === "loading_started") {
            clearTimeout(modelLoadTimerRef.current);
            setModelLoading(true);
            setModelLoadSlow(false);
            modelLoadTimerRef.current = setTimeout(
              () => setModelLoadSlow(true),
              SLOW_MODEL_LOAD_MS,
            );
          } else if (
            type === "loading_completed" ||
            type === "loading_failed"
          ) {
            clearTimeout(modelLoadTimerRef.current);
            setModelLoading(false);
            setModelLoadSlow(false);
          }
        },
      );

      return () => {
        unlistenNotice();
        unlistenShow();
        unlistenHide();
        unlistenRecovery();
        unlistenReady();
        unlistenLevel();
        unlistenStream();
        unlistenPhase();
        unlistenModel();
        clearTimeout(modelLoadTimerRef.current);
        clearTimeout(fadeTimerRef.current);
      };
    };

    setupEventListeners();
  }, []);

  // Elapsed capture timer starts only once microphone samples are flowing.
  useEffect(() => {
    if (state !== "streaming" || !isVisible || !captureReady) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [state, isVisible, captureReady]);

  // Stick to the bottom as text streams in — but only while pinned, so a user who
  // has scrolled up to read history isn't yanked back down by the next chunk.
  useLayoutEffect(() => {
    const el = capRef.current;
    if (!el) return;
    // Fade the top edge only once text actually overflows the cap.
    setOverflowing(el.scrollHeight > el.clientHeight + 1);
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [streamText]);

  // `session` re-runs this when a new Live session starts mid-load (e.g. a
  // retry during a cold load), since the reset doesn't change the other deps.
  useEffect(() => {
    if (modelLoadSlow && state === "streaming") setLoadNoticeShown(true);
  }, [modelLoadSlow, state, session]);

  // The recovery card closes on its own unless the pointer is resting on it.
  useEffect(() => {
    if (state !== "recovery" || !isVisible || recoveryHeld) return;
    const id = setTimeout(
      () => commands.dismissPasteRecovery(),
      RECOVERY_VISIBLE_MS,
    );
    return () => clearTimeout(id);
  }, [state, isVisible, recoveryHeld, recovery]);

  // The card never takes focus, so mouse events never reach it; the backend
  // sends the pointer (window points) instead.
  useEffect(() => {
    if (state !== "recovery" || !isVisible) return;
    const unlisten = listen<[number, number]>("recovery-pointer", (event) => {
      const hit = document.elementFromPoint(...event.payload);
      const row = hit?.closest<HTMLElement>(".srecover-row");
      setRecoveryHeld(!!hit?.closest(".srecover"));
      setHoverRow(row ? Number(row.dataset.index) : -1);
    });
    return () => {
      unlisten.then((stop) => stop());
      setRecoveryHeld(false);
      setHoverRow(-1);
    };
  }, [state, isVisible]);

  // Each fresh streaming session starts pinned to the bottom, fade cleared.
  useEffect(() => {
    pinnedRef.current = true;
    setOverflowing(false);
  }, [session]);

  const shownNotice = notice && isNoticeState(state) ? notice : null;
  const noticeTitle = shownNotice
    ? t(noticeDisplay(shownNotice.code).title)
    : "";

  // CSS can't animate to an intrinsic width, so a notice pill gets a measured one.
  useLayoutEffect(() => {
    const probe = noticeProbeRef.current;
    if (!probe) return;
    setNoticeWidth(
      Math.ceil(probe.getBoundingClientRect().width) + NOTICE_PILL_CHROME,
    );
  }, [noticeTitle, isVisible]);

  if (!pill.mounted && !shownNotice) return null;
  const pillOut = pill.closing && !shownNotice;

  // Re-pin when the user is within ~a line of the bottom; unpin otherwise.
  const handleStreamScroll = () => {
    const el = capRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= 16;
  };

  const fmtTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const transcribingLabel = modelLoading
    ? t("overlay.loadingModel")
    : t("overlay.transcribing");

  // ---- Shared building blocks (one visual language for every overlay form) ----
  const waveform = (
    <div className={`swave ${captureReady ? "ready" : "arming"}`}>
      <div className="swave-track">
        {bars.map((v, i) => (
          <i key={i} style={{ height: `${2 + Math.pow(v, 0.8) * 16}px` }} />
        ))}
      </div>
    </div>
  );

  const cancelBtn = (
    <button
      className="sx"
      aria-label="cancel"
      onClick={() => commands.cancelOperation()}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M4 4 L12 12 M12 4 L4 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );

  // quote mark (left) | waveform (center) | timer + cancel (right) — same structure for
  // pill & panel, so the Live morph is a pure width change.
  const listeningRow = (showTimer: boolean, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        {/* The Escrevoz quote mark opens the line the voice writes. */}
        <svg
          className={`squote ${captureReady ? "ready" : "arming"}`}
          viewBox="38 54 128 101"
          aria-hidden="true"
        >
          <circle cx="66" cy="127" r="28" />
          <path d="M38 127A84 84 0 0 1 80 54.3L92 75A60 60 0 0 0 64 111.5Z" />
          <circle cx="138" cy="127" r="28" />
          <path d="M110 127A84 84 0 0 1 152 54.3L164 75A60 60 0 0 0 136 111.5Z" />
        </svg>
      </div>
      {waveform}
      <div className="sbase-r">
        {showTimer && <span className="stimer">{fmtTime(elapsed)}</span>}
        {showCancel && cancelBtn}
      </div>
    </div>
  );

  // spinner (left) | label (center) | cancel (right) — same 3-zone grid as the
  // listening row, so the label is centered.
  const workingRow = (label: string, showCancel: boolean) => (
    <div className="sbase">
      <div className="sbase-l">
        <span className="sspinner" />
      </div>
      <span className="swork-label">{label}</span>
      <div className="sbase-r">{showCancel && cancelBtn}</div>
    </div>
  );

  const noticeRow = (
    <div className="sbase snotice">
      <NoticeBadgeIcon className="nglyph" />
      <span className="nlabel">{noticeTitle}</span>
    </div>
  );
  const noticeProbe = shownNotice && (
    <span ref={noticeProbeRef} className="nlabel nprobe" aria-hidden="true">
      {noticeTitle}
    </span>
  );
  const noticeClass = shownNotice ? `cnotice level-${shownNotice.level}` : "";
  const dismissNotice = shownNotice
    ? () => commands.dismissOverlayNotice()
    : undefined;

  // ---- Paste recovery: the transcripts that may not have landed, styled like
  // the Cmd+Shift+V menu. A click on a row pastes it into the app in front.
  if (state === "recovery") {
    return (
      // The window sits at the pointer, so the card hangs from its top edge.
      <div dir={direction} className="ov-stage top">
        <div className="scard open srecover">
          <div className="srecover-head">
            <span className="srecover-title">
              {recovery.lost
                ? t("overlay.recovery.title")
                : t("tray.recentTranscripts")}
              <span className="srecover-hint">
                {t("overlay.recovery.hint")}
              </span>
            </span>
            <button
              className="sx"
              aria-label={t("overlay.recovery.close")}
              onClick={() => commands.dismissPasteRecovery()}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M4 4 L12 12 M12 4 L4 12"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          {recovery.labels.map((label, index) => (
            <button
              type="button"
              className={
                index === hoverRow ? "srecover-row hover" : "srecover-row"
              }
              data-index={index}
              key={index}
              onClick={() => commands.pasteRecoveryText(index)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- Live overlay: a pill that sculpts open into a panel ----
  const liveNotice = state === "live_notice" ? shownNotice : null;
  if (state === "streaming" || liveNotice) {
    const hasText =
      streamText.committed.length > 0 || streamText.tentative.length > 0;
    const working = !liveNotice && phase === "working";
    // A notice keeps the transcript; with none, the panel explains the notice.
    const noticeText =
      liveNotice && !hasText
        ? (noticeDisplay(liveNotice.code).explanation?.(t) ?? liveNotice.detail)
        : null;
    // While listening, a slow model load opens the panel with a notice where the
    // text would be, so speech that isn't transcribing yet doesn't look ignored.
    const loadingNotice = !liveNotice && modelLoadSlow && !working && !hasText;
    // Keep the panel open whenever there's text — even while finalizing — so the
    // transcript stays put under a working spinner instead of collapsing and
    // squishing the text mid-stream. Only fall back to the small working pill
    // when there was no text to preserve.
    const open = liveNotice
      ? hasText || !!noticeText
      : hasText || loadingNotice || (loadNoticeShown && !working);
    const collapsed = working && !hasText;

    return (
      <div dir={direction} className={`ov-stage ${position}`}>
        {noticeProbe}
        <div
          key={session}
          className={`scard ${open ? "open" : ""} ${collapsed ? "working" : ""} ${
            isVisible ? "" : "leaving"
          } ${noticeClass}`}
          style={liveNotice && !open ? { width: noticeWidth } : undefined}
          onClick={dismissNotice}
        >
          <div className="stext">
            <div className="stext-clip">
              <div
                className={`stext-cap ${overflowing ? "overflowing" : ""}`}
                ref={capRef}
                onScroll={handleStreamScroll}
              >
                <p>
                  {loadingNotice && (
                    <span className="sloading">
                      {t("overlay.loadingModel")}
                    </span>
                  )}
                  {noticeText && <span className="ndetail">{noticeText}</span>}
                  <span className="committed">
                    {streamText.committed ? streamText.committed + " " : ""}
                  </span>
                  <span className="tentative">{streamText.tentative}</span>
                  {/* Drop the blinking caret once finalizing — it's no longer
                      capturing, and a static spinner conveys the work. */}
                  {!working && !loadingNotice && !liveNotice && (
                    <span className="scaret" />
                  )}
                </p>
              </div>
            </div>
          </div>
          {liveNotice
            ? noticeRow
            : working
              ? workingRow(
                  workKind === "polishing"
                    ? t("overlay.processing")
                    : transcribingLabel,
                  true,
                )
              : listeningRow(open, true)}
        </div>
      </div>
    );
  }

  // ---- Minimal overlay: exactly one row at a time — waveform (recording), or a
  // spinner + label (transcribing / processing). Never both. The pill animates its
  // width between them; the cancel button is in both rows so it stays put.
  const working = state === "transcribing" || state === "processing";
  const workLabel =
    state === "processing" ? t("overlay.processing") : transcribingLabel;

  return (
    <div
      dir={direction}
      className={`ov-stage ${position} ov-fade ${isVisible || pillOut ? "show" : ""}`}
    >
      {noticeProbe}
      <div
        className={`scard compact ${working && isVisible ? "cworking" : ""} ${pillOut ? "pill-out" : ""} ${noticeClass}`}
        style={shownNotice ? { width: noticeWidth } : undefined}
        onClick={dismissNotice}
      >
        {shownNotice
          ? noticeRow
          : working
            ? workingRow(workLabel, true)
            : listeningRow(false, true)}
      </div>
    </div>
  );
};

export default RecordingOverlay;
