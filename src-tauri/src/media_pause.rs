//! Pauses the media the user is listening to while they dictate, and resumes it
//! afterwards, so a video picks up where it stopped instead of having played on
//! under a mute.
//!
//! macOS only. `MediaRemote` is private: reading the now-playing state is gated
//! for unentitled apps, but sending play/pause still reaches the now-playing
//! app (browsers through Media Session, Music, Spotify, ...). CoreAudio only
//! answers "is anything else playing?": a paused player keeps its output
//! stream open for 10-20 s (measured with QuickTime and Chromium), so it can't
//! confirm a pause took effect. The caller still mutes, as a fallback.
//!
//! The pause goes to whatever app holds Now Playing, which can be a paused
//! browser tab rather than the app making sound. So only sound from media apps
//! counts: a call, a game or a chat app gets muted, never paused, or the play
//! sent on stop would start that paused tab.

#[cfg(target_os = "macos")]
mod imp {
    use log::debug;
    use objc2::rc::Retained;
    use objc2_foundation::NSString;
    use std::ffi::c_void;

    const SYSTEM_OBJECT: u32 = 1;
    const SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
    const PROCESS_OBJECT_LIST: u32 = u32::from_be_bytes(*b"prs#");
    const PROCESS_IS_RUNNING_OUTPUT: u32 = u32::from_be_bytes(*b"piro");
    const PROCESS_BUNDLE_ID: u32 = u32::from_be_bytes(*b"pbid");

    /// Bundle ID prefixes of apps that answer play/pause through Now Playing.
    /// Browser helpers share their app's prefix; Safari plays from WebKit.GPU.
    const MEDIA_APPS: &[&str] = &[
        "com.apple.WebKit",
        "com.apple.Safari",
        "com.google.Chrome",
        "com.vivaldi.Vivaldi",
        "com.brave.Browser",
        "com.microsoft.edgemac",
        "company.thebrowser",
        "org.mozilla.firefox",
        "com.operasoftware.Opera",
        "com.apple.Music",
        "com.apple.podcasts",
        "com.apple.TV",
        "com.apple.QuickTimePlayerX",
        "com.spotify.client",
        "org.videolan.vlc",
        "com.colliderli.iina",
    ];

    const COMMAND_PLAY: u32 = 0;
    const COMMAND_PAUSE: u32 = 1;

    #[repr(C)]
    struct PropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(
            id: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            id: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    fn address(selector: u32) -> PropertyAddress {
        PropertyAddress {
            selector,
            scope: SCOPE_GLOBAL,
            element: 0,
        }
    }

    fn read_u32(id: u32, selector: u32) -> Option<u32> {
        let mut value = 0u32;
        let mut size = 4u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                id,
                &address(selector),
                0,
                std::ptr::null(),
                &mut size,
                &mut value as *mut u32 as *mut c_void,
            )
        };
        (status == 0).then_some(value)
    }

    fn bundle_id(id: u32) -> Option<String> {
        let mut value: *mut NSString = std::ptr::null_mut();
        let mut size = std::mem::size_of::<*mut NSString>() as u32;
        let status = unsafe {
            AudioObjectGetPropertyData(
                id,
                &address(PROCESS_BUNDLE_ID),
                0,
                std::ptr::null(),
                &mut size,
                &mut value as *mut *mut NSString as *mut c_void,
            )
        };
        if status != 0 {
            return None;
        }
        // CoreAudio hands over a +1 CFString, toll-free bridged to NSString.
        unsafe { Retained::from_raw(value) }.map(|s| s.to_string())
    }

    pub(super) fn is_media_app(bundle: &str) -> bool {
        MEDIA_APPS.iter().any(|prefix| bundle.starts_with(prefix))
    }

    /// Whether a media app is sending audio to an output.
    /// `None` when CoreAudio can't say (process objects need macOS 14.2+).
    pub fn media_playing() -> Option<bool> {
        let list = address(PROCESS_OBJECT_LIST);
        let mut size = 0u32;
        let status = unsafe {
            AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &list, 0, std::ptr::null(), &mut size)
        };
        if status != 0 {
            return None;
        }
        let mut ids = vec![0u32; size as usize / 4];
        let status = unsafe {
            AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &list,
                0,
                std::ptr::null(),
                &mut size,
                ids.as_mut_ptr() as *mut c_void,
            )
        };
        if status != 0 {
            return None;
        }
        ids.truncate(size as usize / 4);
        Some(ids.iter().any(|&id| {
            read_u32(id, PROCESS_IS_RUNNING_OUTPUT) == Some(1)
                && bundle_id(id).is_some_and(|b| is_media_app(&b))
        }))
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

    /// Sends pause when a media app is playing audio, and reports whether it
    /// did, so the caller knows to press play afterwards.
    // shortcut: a player paused by the user less than ~15 s before dictation
    // still looks like it's playing and gets resumed on stop; fixing that needs
    // the gated now-playing state or a system-audio tap.
    pub fn pause_playing() -> bool {
        let paused = media_playing() == Some(true) && send_command(COMMAND_PAUSE);
        if paused {
            debug!("Paused the now-playing media for recording");
        }
        paused
    }

    pub fn resume() {
        send_command(COMMAND_PLAY);
        debug!("Resumed the media paused for recording");
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
    fn core_audio_reports_who_is_playing() {
        // Only checks the CoreAudio read; sends no play or pause.
        assert!(super::imp::media_playing().is_some());
    }

    #[test]
    fn only_media_apps_get_paused() {
        use super::imp::is_media_app;
        assert!(is_media_app("com.vivaldi.Vivaldi.helper"));
        assert!(is_media_app("com.apple.WebKit.GPU"));
        assert!(is_media_app("com.spotify.client"));
        assert!(!is_media_app("com.anthropic.claudefordesktop.helper"));
        assert!(!is_media_app("us.zoom.xos"));
        assert!(!is_media_app("com.pais.handy"));
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
