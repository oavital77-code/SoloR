"use client";
// Opening screen: only the logo, gently growing and shrinking, until the app has loaded.
// Rendered on the server so it is the very first thing on screen; fades out once the page is ready.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Logo } from "./Logo";

const MIN_MS = 900;

export function Splash() {
  const [phase, setPhase] = useState<"on" | "fading" | "off">("on");

  useEffect(() => {
    const start = performance.now();
    let t: number | undefined;
    const done = () => {
      t = window.setTimeout(() => {
        setPhase("fading");
        t = window.setTimeout(() => setPhase("off"), 400);
      }, Math.max(0, MIN_MS - (performance.now() - start)));
    };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => { window.removeEventListener("load", done); window.clearTimeout(t); };
  }, []);

  if (phase === "off") return null;
  return (
    <div aria-hidden data-theme="night" className={clsx("fixed inset-0 z-[200] grid place-items-center bg-ink text-ivory transition-opacity duration-400",
      phase === "fading" && "opacity-0")}>
      <div className="wash absolute inset-0" />
      {/* the symbol at the centre on ground, a soft bordeaux glow above (design system: Logos) */}
      <div className="relative flex flex-col items-center gap-7">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/symbol.svg" alt="" className="animate-splash size-28" />
        <Logo height={36} />
      </div>
    </div>
  );
}
