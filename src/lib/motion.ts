"use client";
// GSAP for the site's motion (design: נייר קצבים × אפליקציה): headlines that rise, posts revealed on scroll, the
// loader that slices the steak and the cut page that slices the block. Everything checks reduced motion first: then
// things are simply there.
import { useEffect, useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;
export function motion() {
  if (!registered && typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return { gsap, ScrollTrigger };
}

export const reducedMotion = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** runs before paint on the client, so a `from` state never flashes */
export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const DONE = "bp:loader-done";
type W = Window & { __bpLoaderDone?: boolean };
/** the opening loader is gone, or will not play (seen this session, reduced motion): the page's own entrance can play */
export function afterLoader(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  if ((window as W).__bpLoaderDone || !document.querySelector("[data-bp-loader]")
    || document.documentElement.dataset.bpSeen || reducedMotion()) { cb(); return () => {}; }
  window.addEventListener(DONE, cb, { once: true });
  return () => window.removeEventListener(DONE, cb);
}
export function loaderDone() {
  (window as W).__bpLoaderDone = true;
  window.dispatchEvent(new Event(DONE));
}
