// Prints 1 if the Now Playing app is playing, 0 if not, nothing if unknown.
// Loaded into /usr/bin/perl by media_pause.rs: MediaRemote answers Apple's
// own binaries but returns "not playing" to unentitled apps like Escrevoz.
#include <dispatch/dispatch.h>
#include <dlfcn.h>
#include <stdio.h>

typedef void (*IsPlayingFn)(dispatch_queue_t, void (^)(int));

__attribute__((constructor)) static void report(void) {
    void *mr = dlopen(
        "/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote", RTLD_NOW);
    IsPlayingFn is_playing =
        mr ? (IsPlayingFn)dlsym(mr, "MRMediaRemoteGetNowPlayingApplicationIsPlaying") : NULL;
    if (!is_playing) return;
    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    is_playing(dispatch_queue_create("now-playing", 0), ^(int playing) {
        printf("%d", playing ? 1 : 0);
        fflush(stdout);
        dispatch_semaphore_signal(done);
    });
    dispatch_semaphore_wait(done, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC));
}
