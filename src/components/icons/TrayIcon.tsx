import { useId } from "react";

/** The tray icon, drawn like src-tauri/resources/tray_*.png; uses currentColor like a macOS template image. */
type TrayIconState = "idle" | "recording" | "transcribing";

const Mark = ({ transform }: { transform: string }) => (
  <g transform={transform}>
    <circle cx="66" cy="127" r="28" />
    <path d="M38 127A84 84 0 0 1 80 54.3L92 75A60 60 0 0 0 64 111.5Z" />
    <circle cx="138" cy="127" r="28" />
    <path d="M110 127A84 84 0 0 1 152 54.3L164 75A60 60 0 0 0 136 111.5Z" />
    <rect x="192" y="54" width="26" height="148" rx="6" />
  </g>
);

const TrayIcon = ({
  state,
  size,
}: {
  state: TrayIconState;
  size: number | string;
}) => {
  const maskId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className="fill-current"
      xmlns="http://www.w3.org/2000/svg"
    >
      {state === "idle" && (
        <Mark transform="translate(-7.82 -7.82) scale(0.3111)" />
      )}
      {state === "recording" && (
        <>
          {/* Listening: a solid disc with the mark cut out of it. */}
          <mask id={maskId}>
            <rect width="64" height="64" fill="#fff" />
            <g fill="#000">
              <Mark transform="translate(6.4 6.4) scale(0.2)" />
            </g>
          </mask>
          <circle cx="32" cy="32" r="32" mask={`url(#${maskId})`} />
        </>
      )}
      {state === "transcribing" && (
        <>
          <circle
            cx="32"
            cy="32"
            r="29"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
          />
          <Mark transform="translate(8.96 8.96) scale(0.18)" />
        </>
      )}
    </svg>
  );
};

export default TrayIcon;
