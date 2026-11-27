//! Pauses the media the user is listening to while they dictate, and resumes it
//! afterwards, so a video picks up where it stopped instead of having played on
//! under a mute.
//!
//! macOS only. `MediaRemote` is private: sending play/pause reaches the
//! now-playing app (browsers through Media Session, Music, Spotify, ...), but
//! asking whether it plays returns "no" to unentitled apps. Apple's own
//! binaries still get the answer, so a small helper (`now_playing.c`) runs
//! inside `/usr/bin/perl` to ask. Unknown means no pause: the caller's mute
//! still covers the sound, and a paused video never starts on its own.

#[cfg(target_os = "macos")]
mod imp {
    use log::{debug, warn};
    use std::ffi::c_void;
    use std::path::PathBuf;
    use std::process::Command;

    const HELPER: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/now_playing.dylib"));

    const COMMAND_PLAY: u32 = 0;
    const COMMAND_PAUSE: u32 = 1;

    /// The helper in the per-user temp dir, written again if macOS cleaned it up.
    fn helper_path() -> Option<PathBuf> {
        let dir = std::env::temp_dir();
        let path = dir.join(format!("escrevoz-now-playing-{}.dylib", HELPER.len()));
        if !path.exists() {
            // Write beside it and rename, so perl never loads a half-written file.
            let tmp = dir.join(format!("escrevoz-now-playing-{}.tmp", std::process::id()));
            std::fs::write(&tmp, HELPER)
                .and_then(|_| std::fs::rename(&tmp, &path))
                .map_err(|e| warn!("Can't write the now-playing helper: {e}"))
                .ok()?;
        }
        Some(path)
    }

    /// Whether the now-playing app is playing. `None` when macOS won't say.
    pub fn is_playing() -> Option<bool> {
        let out = Command::new("/usr/bin/perl")
            .args([
                "-e",
                "require DynaLoader; DynaLoader::dl_load_file($ARGV[0], 0) or exit 2",
            ])
            .arg(helper_path()?)
            .output()
            .ok()?;
        match out.stdout.as_slice() {
            b"1" => Some(true),
            b"0" => Some(false),
            _ => None,
        }
    }

    fn send_command(command: u32) -> bool {
        type SendCommand = unsafe extern "C" fn(u32, *const c_void) -> bool;
        unsafe {
            let handle = libc::dlopen(
                c"/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote".as_ptr(),
                libc::RTLD_NOW,
            );
            if handle.is_null() {
                return false;
            }
            let symbol = libc::dlsym(handle, c"MRMediaRemoteSendCommand".as_ptr());
            if symbol.is_null() {
                return false;
            }
            let send: SendCommand = std::mem::transmute(symbol);
            send(command, std::ptr::null())
        }
    }

    /// Sends pause only when the now-playing app is playing, and reports
    /// whether it did, so the caller knows to press play afterwards.
    pub fn pause_playing() -> bool {
        let paused = is_playing() == Some(true) && send_command(COMMAND_PAUSE);
        if paused {
            debug!("Paused the now-playing media for recording");
        }
        paused
    }

    /// Presses play, unless the user already did.
    pub fn resume() {
        if is_playing() != Some(true) {
            send_command(COMMAND_PLAY);
            debug!("Resumed the media paused for recording");
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::{pause_playing, resume};

#[cfg(not(target_os = "macos"))]
pub fn pause_playing() -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
pub fn resume() {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn reads_the_now_playing_state() {
        // Read-only: asks macOS, sends no play or pause.
        assert!(super::imp::is_playing().is_some());
    }

    /// Needs a paused video or song holding Now Playing: nothing gets sent.
    /// `cargo test --lib media_pause -- --ignored leaves`
    #[test]
    #[ignore]
    fn leaves_paused_media_alone() {
        assert_eq!(
            super::imp::is_playing(),
            Some(false),
            "something is playing"
        );
        assert!(!super::pause_playing());
    }

    /// Needs a player already playing (a silent file works). `PLAYING_CHECK`
    /// is a shell command that prints `true` while it plays; it defaults to
    /// QuickTime Player. `cargo test --lib media_pause -- --ignored`
    #[test]
    #[ignore]
    fn pauses_and_resumes_a_real_player() {
        use std::{process::Command, thread::sleep, time::Duration};
        let check = std::env::var("PLAYING_CHECK").unwrap_or_else(|_| {
            "osascript -e 'tell application \"QuickTime Player\" to get playing of document 1'"
                .into()
        });
        let playing = || {
            let out = Command::new("sh").args(["-c", &check]).output().unwrap();
            String::from_utf8_lossy(&out.stdout).trim() == "true"
        };
        assert!(playing(), "the player isn't playing");
        for _ in 0..3 {
            assert!(super::pause_playing(), "nothing was playing");
            sleep(Duration::from_secs(2));
            assert!(!playing(), "pause failed");
            super::resume();
            sleep(Duration::from_secs(1));
            assert!(playing(), "resume failed");
            sleep(Duration::from_secs(1));
        }
    }
}
