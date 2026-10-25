"use client";
// The cut and what was cut from it — the whole buying block of the cut's page (design: נייר קצבים × אפליקציה,
// sketch 4; founders 25.10.2026: the cut on top and bigger, the trays opening out of it, each with its own order
// button; no second list under it). The block (or the cut itself, when all of it went into trays) is in front; the
// trays start hidden behind it and, as the page scrolls, come down out of it into a column, their stickers popping
// with number, weight and price. A tap on a photo shows it in the page's big frame. With reduced motion everything
// is simply in place.
import { useRef } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { isAvailable, linePrice } from "@/lib/items";
import { motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";
import { formatWeight, money } from "@/lib/pricing";
import type { CutMedia, SaleItem } from "@/lib/types";

const TILT = [-3, 2.5, -2, 3];
const SHIFT = [10, -10, 6, -6];

export function SlicedCut({ lead, trays, focus, onPhoto, trayAction, leadBuy, href, leadOverlay }: {
  /** the block (id = its label, for #i-…) or the cut itself; `no` is the cut's number, `block` whether it is the block */
  lead: { cover?: CutMedia; label: string; id?: string; sold?: boolean; no: string; block: boolean };
  trays: SaleItem[];
  /** the label opened from a post: ringed */
  focus?: string | null;
  onPhoto: (m: CutMedia | undefined) => void;
  /** a tray's order button, or what stands in its place (sold, held, in the cart) */
  trayAction: (t: SaleItem) => React.ReactNode;
  /** the block's buying (all of it or a slice), under its photo */
  leadBuy?: React.ReactNode;
  /** in the feed: a photo opens the cut's page (at that tray) instead of showing it in a big frame */
  href?: (label?: string) => string;
  /** over the cut's photo: the sold stamp, the held badge */
  leadOverlay?: React.ReactNode;
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
      tl.to(el.querySelector("[data-lead]"), { rotate: -2, scale: 1.03, duration: 0.6 }, 0);
      slices.forEach((s, i) => tl.to(s, { ...done(i), scale: 1, duration: 1, ease: "power2.out" }, i * 0.12));
      tl.to(pops, { opacity: 1, scale: 1, stagger: 0.08, duration: 0.4, ease: "back.out(3)" }, 0.45);
    }, el);
    return () => ctx.revert();
  }, [key]);

  const photo = "block size-full overflow-hidden rounded-[56px/38px] border-4 border-sticker bg-ink-3 shadow-[0_18px_30px_-16px_rgba(27,23,18,0.6)]";
  const sticker = "absolute -top-3 right-3 z-[1] -rotate-[4deg] border-2 border-[#1b1712] bg-sticker px-2.5 py-0.5 font-mono text-[12px] font-semibold whitespace-nowrap text-[#1b1712]";
  // a photo: a link to the cut's page (feed), or a button that shows it in the page's big frame
  const shot = (m: CutMedia | undefined, label: string, anchor: string | undefined, extra?: string) => href
    ? <Link href={href(anchor)} data-media-frame aria-label={label} className={clsx(photo, extra)}>{img(m)}</Link>
    : <button type="button" onClick={() => onPhoto(m)} aria-label={he.cut.showPhoto(label)} className={clsx(photo, extra)}>{img(m)}</button>;
  const img = (m?: CutMedia) => m
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={mediaUrl(m.thumb_path ?? m.storage_path)} alt="" className="size-full object-cover" />
    : null;

  return (
    <div ref={stage} className="relative mx-auto flex w-full max-w-[380px] flex-col">
      <div id={lead.id && !href ? `i-${lead.id}` : undefined} className="relative z-10 flex scroll-mt-24 flex-col gap-4">
        <div data-lead className={clsx("relative mx-auto h-[176px] w-full max-w-[350px]", lead.sold && "grayscale")}>
          {shot(lead.cover, lead.label, lead.id)}
          {leadOverlay && <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[56px/38px]">{leadOverlay}</div>}
          <span className={clsx(sticker, "text-[13px]", focus && focus === lead.id && "ring-2 ring-brand")}>{lead.label}</span>
        </div>
        {leadBuy && <div className="rounded-2xl border-2 border-ivory bg-ink-2 p-3">{leadBuy}</div>}
        {trays.length > 0 && <PartOfMe no={lead.no} block={lead.block} />}
      </div>
      {trays.length > 0 && (
        <ul className="relative z-0 m-0 mt-5 flex list-none flex-col gap-10 p-0 pb-4" aria-label={he.item.cutFrom(trays.length)}>
          {trays.map((t) => {
            const cover = coverOf(t.cut_media);
            const sold = !isAvailable(t);
            return (
              <li key={t.id} id={href ? undefined : `i-${t.label}`} data-tray
                className={clsx("relative mx-auto h-[116px] w-[300px] max-w-[90%] scroll-mt-24", sold && "grayscale")}>
                {shot(cover, t.code, t.label ?? undefined, focus === t.label ? "!border-brand" : undefined)}
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

/** Between the cut and its trays (founders' pick, 25.10.2026): a knife runs along a dashed cutting line, then the red
 * "חלק ממני" sticker pops on it and "pick the very pieces of cut 109" appears under it. Once, as it scrolls in. */
function PartOfMe({ no, block }: { no: string; block: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = root.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const q = gsap.utils.selector(el);
    const ctx = gsap.context(() => {
      gsap.set(q("[data-knife]"), { x: 0, opacity: 1 });
      gsap.set(q("[data-line]"), { opacity: 0.2 });
      gsap.set(q("[data-sticker]"), { scale: 0, rotate: -30 });
      gsap.set(q("[data-sub]"), { opacity: 0, y: 10 });
      gsap.timeline({ scrollTrigger: { trigger: el, start: "top 85%", once: true } })
        .to(q("[data-knife]"), { x: () => -(el.offsetWidth - 64), duration: 1.1, ease: "power2.inOut" })
        .to(q("[data-line]"), { opacity: 1, duration: 1.1, ease: "none" }, 0)
        .to(q("[data-knife]"), { opacity: 0, duration: 0.2 })
        .to(q("[data-sticker]"), { scale: 1, rotate: -3, duration: 0.5, ease: "back.out(3)" }, "-=0.1")
        .to(q("[data-sub]"), { opacity: 1, y: 0, duration: 0.4 }, "-=0.2");
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={root} className="relative h-[92px]">
      <svg aria-hidden className="absolute inset-x-0 top-[18px] h-1 w-full overflow-visible">
        <line data-line x1="2%" y1="2" x2="98%" y2="2" stroke="var(--color-ivory)" strokeWidth="2.5" strokeDasharray="8 6" />
      </svg>
      <svg data-knife viewBox="0 0 60 24" aria-hidden className="absolute top-2 right-1 h-6 w-[60px] opacity-0">
        <path d="M2 12 L36 4 L40 12 L36 20 Z" fill="#D8DEE0" stroke="#1B1712" strokeWidth="2" />
        <rect x="38" y="8" width="20" height="8" rx="3" fill="#8B5A2B" stroke="#1B1712" strokeWidth="2" />
      </svg>
      <div className="absolute inset-x-0 top-0 flex justify-center">
        <span data-sticker className="-rotate-3 rounded-[10px] border-2 border-[#1b1712] bg-[#c8202c] px-3.5 py-0.5 text-[20px] font-black text-sticker">
          {he.cut.partOfMe}
        </span>
      </div>
      <p data-sub className="absolute inset-x-0 top-[54px] m-0 text-center text-[14px] font-bold">{he.cut.partSub(no, block)}</p>
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
