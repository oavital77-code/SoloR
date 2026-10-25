"use client";
// The cut and what was cut from it — the whole buying block of the cut's page (design: נייר קצבים × אפליקציה,
// sketch 4; founders 25.10.2026: the cut on top and bigger, the trays opening out of it, each with its own order
// button; no second list under it). The block (or the cut itself, when all of it went into trays) is in front; the
// trays start hidden behind it and, as the page scrolls, come down out of it into a column, their stickers popping
// with number, weight and price. A tap on a photo shows it in the page's big frame. With reduced motion everything
// is simply in place.
import { useRef } from "react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { isAvailable, linePrice } from "@/lib/items";
import { motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";
import { formatWeight, money } from "@/lib/pricing";
import type { CutMedia, SaleItem } from "@/lib/types";

const TILT = [-3, 2.5, -2, 3];
const SHIFT = [10, -10, 6, -6];

export function SlicedCut({ lead, trays, focus, onPhoto, trayAction, leadBuy }: {
  /** the block (id = its label, for #i-…) or the cut itself */
  lead: { cover?: CutMedia; label: string; id?: string; sold?: boolean };
  trays: SaleItem[];
  /** the label opened from a post: ringed */
  focus?: string | null;
  onPhoto: (m: CutMedia | undefined) => void;
  /** a tray's order button, or what stands in its place (sold, held, in the cart) */
  trayAction: (t: SaleItem) => React.ReactNode;
  /** the block's buying (all of it or a slice), under its photo */
  leadBuy?: React.ReactNode;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const key = trays.map((t) => t.id).join(",");

  useIsoLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const { gsap } = motion();
    const slices = Array.from(el.querySelectorAll<HTMLElement>("[data-tray]"));
    if (!slices.length) return;
    const pops = el.querySelectorAll("[data-pop]");
    const done = (i: number) => ({ y: 0, x: SHIFT[i % 4], rotate: TILT[i % 4] });
    if (reducedMotion()) { slices.forEach((s, i) => gsap.set(s, done(i))); return; }
    const ctx = gsap.context(() => {
      // each tray starts tucked behind the cut's photo
      const photo = el.querySelector<HTMLElement>("[data-lead]")!.getBoundingClientRect();
      const mid = photo.top + photo.height / 2;
      slices.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        gsap.set(s, { y: mid - (r.top + r.height / 2) + (i % 2 ? 8 : -8), x: 0, rotate: i % 2 ? 2 : -2, scale: 0.92 });
      });
      gsap.set(pops, { opacity: 0, scale: 0.6 });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 75%", end: "top 10%", scrub: 0.7 } });
      tl.to(el.querySelector("[data-hint]"), { opacity: 0, duration: 0.2 }, 0)
        .to(el.querySelector("[data-lead]"), { rotate: -2, scale: 1.03, duration: 0.6 }, 0);
      slices.forEach((s, i) => tl.to(s, { ...done(i), scale: 1, duration: 1, ease: "power2.out" }, i * 0.12));
      tl.to(pops, { opacity: 1, scale: 1, stagger: 0.08, duration: 0.4, ease: "back.out(3)" }, 0.45);
    }, el);
    return () => ctx.revert();
  }, [key]);

  const photo = "block size-full overflow-hidden rounded-[56px/38px] border-4 border-sticker bg-ink-3 shadow-[0_18px_30px_-16px_rgba(27,23,18,0.6)]";
  const sticker = "absolute -top-3 right-3 z-[1] -rotate-[4deg] border-2 border-[#1b1712] bg-sticker px-2.5 py-0.5 font-mono text-[12px] font-semibold whitespace-nowrap text-[#1b1712]";
  const img = (m?: CutMedia) => m
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={mediaUrl(m.thumb_path ?? m.storage_path)} alt="" className="size-full object-cover" />
    : null;

  return (
    <div ref={stage} className="relative mx-auto flex w-full max-w-[380px] flex-col">
      <div id={lead.id ? `i-${lead.id}` : undefined} className="relative z-10 flex scroll-mt-24 flex-col gap-4">
        <div data-lead className={clsx("relative mx-auto h-[176px] w-full max-w-[350px]", lead.sold && "grayscale")}>
          <button type="button" onClick={() => onPhoto(lead.cover)} aria-label={he.cut.showPhoto(lead.label)} className={photo}>
            {img(lead.cover)}
          </button>
          <span className={clsx(sticker, "text-[13px]", focus && focus === lead.id && "ring-2 ring-brand")}>{lead.label}</span>
        </div>
        {leadBuy && <div className="rounded-2xl border-2 border-ivory bg-ink-2 p-3">{leadBuy}</div>}
        {trays.length > 0 && (
          <p data-hint className="m-0 text-center font-mono text-[11px] tracking-[0.1em] text-stone">{he.cut.sliceHint}</p>
        )}
      </div>
      {trays.length > 0 && (
        <ul className="relative z-0 m-0 mt-5 flex list-none flex-col gap-10 p-0 pb-4" aria-label={he.item.cutFrom(trays.length)}>
          {trays.map((t) => {
            const cover = coverOf(t.cut_media);
            const sold = !isAvailable(t);
            return (
              <li key={t.id} id={`i-${t.label}`} data-tray
                className={clsx("relative mx-auto h-[116px] w-[300px] max-w-[90%] scroll-mt-24", sold && "grayscale")}>
                <button type="button" onClick={() => onPhoto(cover)} aria-label={he.cut.showPhoto(t.code)}
                  className={clsx(photo, focus === t.label && "!border-brand")}>
                  {img(cover)}
                </button>
                <span data-pop className={sticker}>
                  {t.label}{t.steak_count ? ` · ${he.item.steaks(t.steak_count)}` : ""} · {formatWeight(t.weight_g ?? 0)} · {money(linePrice(t, "unit"))}
                </span>
                <div data-pop className="absolute -bottom-4 left-4 z-[2]">{trayAction(t)}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The black bar at the bottom of the cut's page on a phone (sketch 4): how many things can be bought of this cut and
 * from what price; a tap scrolls to them. Gone while they are on screen. */
export function BuyBar({ count, from, onGo, hidden }: { count: number; from: number; onGo: () => void; hidden: boolean }) {
  return (
    <div className={clsx("fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] transition-transform duration-300 ease-out lg:hidden",
      hidden && "translate-y-full")} aria-hidden={hidden}>
      <div data-theme="night" className="flex items-center gap-3 rounded-t-[30px] bg-ink px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ivory">
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-black">{he.cut.buyBarTitle(count)}</span>
          <span className="text-sm text-stone">{he.cut.buyBarFrom} <span className="ltr">{money(from)}</span></span>
        </span>
        <button type="button" onClick={onGo} tabIndex={hidden ? -1 : 0} className="sr-btn !min-h-12 !px-6">{he.cut.buyBarGo}</button>
      </div>
    </div>
  );
}
