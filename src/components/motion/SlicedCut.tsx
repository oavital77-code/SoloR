"use client";
// The cut, sliced as the page scrolls (design: נייר קצבים × אפליקציה, sketch 4): the block (or the cut itself) in
// front, the trays cut from it hidden behind it; scrolling through, the trays come out of the block above and below
// and their stickers pop up with number, weight and price. A tap on a slice goes to its row. Up to four trays are
// drawn; all of them are listed below it anyway. With reduced motion the slices are simply apart.
import { useRef } from "react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { isAvailable, linePrice } from "@/lib/items";
import { motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";
import { formatWeight, money } from "@/lib/pricing";
import type { CutMedia, SaleItem } from "@/lib/types";

const MAX = 4;
// where each tray ends up: alternately above and below the block, the first two furthest out
const SPOT = [
  { y: -132, x: 10, r: -8 }, { y: 132, x: -10, r: 7 },
  { y: -66, x: -34, r: 4 }, { y: 66, x: 34, r: -5 },
];

export function SlicedCut({ lead, trays, onPick }: {
  lead: { cover?: CutMedia; label: string; id: string };
  trays: SaleItem[];
  onPick: (id: string, cover?: CutMedia) => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const shown = trays.slice(0, MAX);
  const key = shown.map((t) => t.id).join(",");

  useIsoLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const { gsap } = motion();
    const slices = el.querySelectorAll<HTMLElement>("[data-tray]");
    const labels = el.querySelectorAll("[data-lbl]");
    const to = (i: number) => ({ y: SPOT[i].y, x: SPOT[i].x, rotate: SPOT[i].r });
    if (reducedMotion()) {
      slices.forEach((s, i) => gsap.set(s, to(i)));
      return;
    }
    const ctx = gsap.context(() => {
      slices.forEach((s, i) => gsap.set(s, { y: SPOT[i].y > 0 ? 8 : -8, rotate: SPOT[i].r > 0 ? 2 : -2 }));
      gsap.set(labels, { opacity: 0, scale: 0.6 });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", end: "center 40%", scrub: 0.7 } });
      tl.to(el.querySelector("[data-hint]"), { opacity: 0, duration: 0.2 }, 0)
        .to(el.querySelector("[data-lead]"), { rotate: -3, scale: 1.04, duration: 1 }, 0);
      slices.forEach((s, i) => tl.to(s, { ...to(i), duration: 1, ease: "power2.out" }, 0));
      tl.to(labels, { opacity: 1, scale: 1, stagger: 0.12, duration: 0.4, ease: "back.out(3)" }, 0.5);
    }, el);
    return () => ctx.revert();
  }, [key]);

  const slice = "absolute top-[150px] left-1/2 -ml-[130px] block h-[104px] w-[260px]";
  const photo = "block size-full rounded-[52px/34px] border-4 border-sticker bg-ink-3 object-cover shadow-[0_18px_30px_-16px_rgba(27,23,18,0.6)]";
  const sticker = "absolute -top-3 right-3 -rotate-[5deg] border-2 border-[#1b1712] bg-sticker px-2.5 py-0.5 font-mono text-[12px] font-semibold whitespace-nowrap text-[#1b1712]";
  const leadCover = lead.cover;

  return (
    <div ref={stage} className="relative mx-auto h-[404px] w-full max-w-[360px] overflow-hidden">
      <p data-hint className="absolute inset-x-0 top-1 m-0 text-center font-mono text-[11px] tracking-[0.1em] text-stone">{he.cut.sliceHint}</p>
      {shown.map((t) => {
        const cover = coverOf(t.cut_media);
        const sold = !isAvailable(t);
        return (
          <button key={t.id} type="button" data-tray onClick={() => onPick(t.label ?? "", cover)} aria-label={he.cut.showPhoto(t.code)}
            className={clsx(slice, sold && "grayscale")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover ? <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className={photo} /> : <span className={photo} />}
            <span data-lbl className={sticker}>
              {t.label} · {formatWeight(t.weight_g ?? 0)} · {sold ? he.item.soldOut : money(linePrice(t, "unit"))}
            </span>
          </button>
        );
      })}
      <button type="button" data-lead onClick={() => onPick(lead.id, leadCover)} aria-label={he.cut.showPhoto(lead.label)} className={slice}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {leadCover ? <img src={mediaUrl(leadCover.thumb_path ?? leadCover.storage_path)} alt="" className={photo} /> : <span className={photo} />}
        <span data-lbl className={sticker}>{lead.label}</span>
      </button>
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
