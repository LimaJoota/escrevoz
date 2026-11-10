import { useEffect, useState } from "react";

/**
 * Keeps an element mounted for its exit animation after `open` turns false.
 * `closing` is true during those `exitMs`, so it can carry `motion-out`.
 */
export function usePresence(open: boolean, exitMs: number) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const id = setTimeout(() => setMounted(false), exitMs);
    return () => clearTimeout(id);
  }, [open, exitMs]);
  return { mounted: open || mounted, closing: !open && mounted };
}
