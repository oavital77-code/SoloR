"use client";
// Per-screen scroll memory (spec 3.2–3.3): coming back to a screen — by "back" or by its tab — lands where
// the customer left it. Lists load asynchronously, so the position is restored once the screen says it is ready.
import { useEffect, useRef } from "react";

// session-only: a new visit starts at the top
const store = {
  get(k: string): number { try { return Number(window.sessionStorage.getItem(`solor.scroll.${k}`)) || 0; } catch { return 0; } },
  set(k: string, y: number) { try { window.sessionStorage.setItem(`solor.scroll.${k}`, String(Math.round(y))); } catch { /* ignore */ } },
};

export function useScrollMemory(screen: string, ready: boolean) {
  const restored = useRef(false);

  // track the position while the screen is up and store it as it goes away — not on every scroll event,
  // since the next screen's jump to the top would otherwise overwrite it. Nothing is stored before the
  // saved position has been put back, so a remount on the way in cannot wipe it.
  useEffect(() => {
    let y = window.scrollY;
    const track = () => { y = window.scrollY; };
    const save = () => { if (restored.current) store.set(screen, y); };
    window.addEventListener("scroll", track, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", track);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [screen]);

  useEffect(() => {
    if (!ready || restored.current) return;
    const y = store.get(screen);
    requestAnimationFrame(() => {
      if (y > 0) window.scrollTo({ top: y, behavior: "instant" });
      restored.current = true;
    });
  }, [ready, screen]);
}

/** Forget a screen's position (e.g. the logo sends the feed back to its top). */
export const forgetScroll = (screen: string) => store.set(screen, 0);
