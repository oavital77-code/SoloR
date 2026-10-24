"use client";
// The post's photo handed to the cut page (design: the combined journey, step 3): tapping a post remembers which
// picture was on screen and where; the cut page grows that picture from there into its own big frame.
export type Handoff = { src: string; rect: { left: number; top: number; width: number; height: number }; at: number };

let pending: Handoff | null = null;

/** from a post: the frame that holds its media; the slide in view gives the picture (a video gives its poster) */
export function handOffFrom(frame: HTMLElement | null) {
  pending = null;
  if (!frame) return;
  const box = frame.getBoundingClientRect();
  let best: { src: string; d: number } | null = null;
  frame.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video").forEach((m) => {
    const src = m instanceof HTMLImageElement ? m.currentSrc || m.src : m.poster;
    if (!src) return;
    const d = Math.abs(m.getBoundingClientRect().left - box.left);
    if (!best || d < best.d) best = { src, d };
  });
  const chosen = best as { src: string; d: number } | null;
  if (chosen) pending = { src: chosen.src, rect: { left: box.left, top: box.top, width: box.width, height: box.height }, at: Date.now() };
}

/** on the cut page: the picture handed over in the last moment, if any (it expires by itself) */
export function takeHandoff(): Handoff | null {
  return pending && Date.now() - pending.at < 2000 ? pending : null;
}
