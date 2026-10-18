"use client";
// Tracks how long a post stays in view (most of it on screen, the tab visible) for the personal sold-out rule.
// Each continuous stretch is recorded when it ends; while in view the post is listed in `inView`.
import { useEffect, useRef, useState } from "react";
import { inView, recordView } from "@/lib/impressions";

export function usePostView<T extends HTMLElement>(cutId: string) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let since: number | null = null;
    let onScreen = false;
    const start = () => {
      if (since !== null || !onScreen || document.visibilityState !== "visible") return;
      since = Date.now();
      inView.add(cutId);
      setVisible(true);
    };
    const stop = () => {
      if (since === null) return;
      recordView(cutId, Date.now() - since);
      since = null;
      inView.delete(cutId);
      setVisible(false);
    };
    const io = new IntersectionObserver(([e]) => {
      onScreen = e.intersectionRatio >= 0.5;
      if (onScreen) start(); else stop();
    }, { threshold: [0, 0.5, 1] });
    io.observe(el);
    const onVis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", stop);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", stop);
      stop();
    };
  }, [cutId]);

  return { ref, visible };
}
