//! Pauses the media the user is listening to while they dictate, and resumes it
//! afterwards, so a video picks up where it stopped instead of having played on
//! under a mute.
//!
//! macOS only. `MediaRemote` is private: reading the now-playing state is gated
//! for unentitled apps, but sending play/pause still reaches the now-playing
//! app (browsers through Media Session, Music, Spotify, ...). So CoreAudio
//! answers "is anything else playing?" and confirms the pause took effect.

#[cfg(target_os = "macos")]
mod imp {
    use log::debug;
    use std::ffi::c_void;
    use std::time::{Duration, Instant};

    const SYSTEM_OBJECT: u32 = 1;
    const SCOPE_GLOBAL: u32 = u32::from_be_bytes(*b"glob");
    const PROCESS_OBJECT_LIST: u32 = u32::from_be_bytes(*b"prs#");
    const PROCESS_PID: u32 = u32::from_be_bytes(*b"ppid");
    const PROCESS_IS_RUNNING_OUTPUT: u32 = u32::from_be_bytes(*b"piro");

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

    /// Whether any process other than ours is sending audio to an output.
    /// `None` when CoreAudio can't say (process objects need macOS 14.2+).
    pub fn others_playing() -> Option<bool> {
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
        let own_pid = std::process::id();
        Some(ids.iter().any(|&id| {
            read_u32(id, PROCESS_IS_RUNNING_OUTPUT) == Some(1)
                && read_u32(id, PROCESS_PID) != Some(own_pid)
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

    /// Pauses what is playing. `None`: nothing else was playing, so nothing
    /// was sent. `Some(true)`: the output went quiet, so the pause took.
    /// `Some(false)`: sound kept going, from a player that is slow to close its
    /// stream or from something a pause can't reach (a call, a game).
    pub fn pause_playing() -> Option<bool> {
        if others_playing() != Some(true) || !send_command(COMMAND_PAUSE) {
            return None;
        }
        let deadline = Instant::now() + Duration::from_millis(600);
        while Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
            if others_playing() == Some(false) {
                debug!("Paused the now-playing media for recording");
                return Some(true);
            }
        }
        debug!("Sent pause, but audio kept playing");
        Some(false)
    }

    /// Presses play after a confirmed pause. After an unconfirmed one, only if
    /// the sound has stopped since: pressing play while a call still plays
    /// could start media the user had paused themselves.
    pub fn resume(confirmed: bool) {
        if confirmed || others_playing() == Some(false) {
            send_command(COMMAND_PLAY);
            debug!("Resumed the media paused for recording");
        }
    }
}

#[cfg(target_os = "macos")]
pub use imp::{pause_playing, resume};

#[cfg(not(target_os = "macos"))]
pub fn pause_playing() -> Option<bool> {
    None
}

#[cfg(not(target_os = "macos"))]
pub fn resume(_confirmed: bool) {}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    #[test]
    fn core_audio_reports_who_is_playing() {
        // Only checks the CoreAudio read; sends no play or pause.
        assert!(super::imp::others_playing().is_some());
    }
}
