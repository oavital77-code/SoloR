"use client";
// What was cut from the cut, always in sight under it (founders 28.10.2026, "בר 1"): the cut's video and photo swipe
// side to side above; here the "עוד מהנתח" line and the trays as small cards in a row that scrolls sideways — each
// with its photo, number, steaks, weight, price and its own add. Once, as the row comes on screen, a butcher's cleaver
// comes down on the dashed line: the page splits there (what is above jumps up, the row drops and settles), a cut
// runs along the line, the sticker pops and the cards come out of the cut. With reduced motion everything is in place.
import { useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PhotoViewer } from "../PhotoViewer";
import { he } from "@/lib/i18n/he";
import { coverOf, mediaUrl } from "@/lib/cut-helpers";
import { isAvailable, linePrice } from "@/lib/items";
import { motion, reducedMotion, useIsoLayoutEffect } from "@/lib/motion";
import { formatWeight, money } from "@/lib/pricing";
import type { SaleItem } from "@/lib/types";

export function TrayBar({ trays, no, block, focus, trayAction, href }: {
  trays: SaleItem[];
  /** the cut's number, and whether what leads is its block */
  no: string; block: boolean;
  /** the label opened from a post: ringed */
  focus?: string | null;
  /** a tray's order button, or what stands in its place (sold, held, in the cart) */
  trayAction: (t: SaleItem) => React.ReactNode;
  /** in the feed: a photo opens the cut's page at that tray; on the page it opens full screen */
  href?: (label?: string) => string;
}) {
  const sec = useRef<HTMLElement>(null);
  const [viewer, setViewer] = useState<SaleItem | null>(null);
  const key = trays.map((t) => t.id).join(",");

  useIsoLayoutEffect(() => {
    const el = sec.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const q = gsap.utils.selector(el);
    // what sits above the row (the block's buying): it jumps the other way when the page splits
    const above = el.previousElementSibling ?? el.parentElement?.previousElementSibling ?? null;
    const ctx = gsap.context(() => {
      const cleaver = q("[data-cleaver]");
      gsap.set(cleaver, { autoAlpha: 0, y: -40, rotate: -30, transformOrigin: "100% 25%" });
      gsap.set(q("[data-crack]"), { scaleX: 0, transformOrigin: "22% 50%" });
      gsap.set(q("[data-sticker]"), { scale: 0, rotate: -30 });
      gsap.set(q("[data-tray]"), { x: -60, autoAlpha: 0, rotate: -3 });
      const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: "top 88%", once: true } });
      // raised high, then one hard chop onto the line
      tl.to(cleaver, { autoAlpha: 1, y: -34, rotate: -46, duration: 0.28, ease: "power2.out" })
        .to(cleaver, { y: 0, rotate: 0, duration: 0.13, ease: "power4.in" })
        .addLabel("hit")
        // the page splits along the line: the row drops, what is above jumps up, both settle
        .set(q("[data-line]"), { autoAlpha: 0 }, "hit")
        .to(q("[data-crack]"), { scaleX: 1, duration: 0.2, ease: "power3.out" }, "hit")
        .fromTo(el, { y: 0 }, { y: 12, duration: 0.07, ease: "power2.out", immediateRender: false }, "hit")
        .to(el, { y: 0, duration: 0.7, ease: "elastic.out(1, 0.4)" }, "hit+=0.07");
      if (above) {
        tl.fromTo(above, { y: 0 }, { y: -7, duration: 0.07, ease: "power2.out", immediateRender: false }, "hit")
          .to(above, { y: 0, duration: 0.6, ease: "elastic.out(1, 0.45)" }, "hit+=0.07");
      }
      // the cleaver stays in for a beat, then lifts away
      tl.to(cleaver, { y: -26, rotate: -18, autoAlpha: 0, duration: 0.32, ease: "power2.in" }, "hit+=0.4")
        .to(q("[data-sticker]"), { scale: 1, rotate: -3, duration: 0.45, ease: "back.out(3)" }, "hit+=0.15")
        .to(q("[data-tray]"), { x: 0, autoAlpha: 1, rotate: 0, duration: 0.5, ease: "back.out(1.6)", stagger: 0.08 }, "hit+=0.25");
    }, el);
    return () => ctx.revert();
  }, [key]);

  if (!trays.length) return null;
  return (
    <section ref={sec} aria-label={he.item.cutFrom(trays.length)} className="flex flex-col gap-2">
      <MoreOfCut text={he.cut.partBar(trays.length, no, block)} />
      <ul className="no-scrollbar -mx-3 m-0 flex list-none snap-x gap-2.5 overflow-x-auto px-3 pt-1 pb-1.5 lg:-mx-4 lg:px-4">
        {trays.map((t) => {
          const cover = coverOf(t.cut_media);
          const sold = !isAvailable(t);
          const img = cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" loading="lazy" className="size-full object-cover" />
            : null;
          const photo = "block h-[86px] w-full overflow-hidden bg-ink-3";
          return (
            <li key={t.id} id={href ? undefined : `i-${t.label}`} data-tray
              className={clsx("flex w-[138px] shrink-0 scroll-mx-4 snap-start flex-col overflow-hidden rounded-2xl border-2 bg-ink-2",
                focus === t.label ? "border-brand ring-2 ring-brand" : "border-ivory", sold && "grayscale")}>
              {href
                ? <Link href={href(t.label ?? undefined)} data-media-frame aria-label={t.code} className={photo}>{img}</Link>
                : <button type="button" onClick={() => cover && setViewer(t)} aria-label={he.cut.showPhoto(t.code)} className={photo}>{img}</button>}
              <div className="flex flex-1 flex-col gap-0.5 px-2 pt-1.5 pb-2">
                <span className="text-[12px] font-semibold whitespace-nowrap">
                  <span className="code !text-[12px]">{t.label}</span>{t.steak_count ? ` · ${he.item.steaks(t.steak_count)}` : ""}
                </span>
                <span className="text-[12px] text-stone">{formatWeight(t.weight_g ?? 0)} · <span className="ltr font-bold text-ivory">{money(linePrice(t, "unit"))}</span></span>
                <div className="mt-auto pt-1.5 [&>*]:!w-full [&>*]:!px-2 [&>*]:justify-center">{trayAction(t)}</div>
              </div>
            </li>
          );
        })}
      </ul>
      {viewer && coverOf(viewer.cut_media) && (
        <PhotoViewer photos={[coverOf(viewer.cut_media)!]} start={0} title={viewer.code} code={viewer.code} onClose={() => setViewer(null)} />
      )}
    </section>
  );
}

/** The "עוד מהנתח" line: the red sticker and what is in the row over a dashed cutting line, and the butcher's cleaver
 * that comes down on it (the row's own timeline drives them). After the chop the dashed line is a cut. */
function MoreOfCut({ text }: { text: string }) {
  return (
    <div className="relative pb-2.5">
      <div className="flex items-center gap-2">
        <span data-sticker className="-rotate-3 rounded-lg border-2 border-[#111111] bg-[#7a1020] px-2.5 text-[15px] leading-[22px] font-black text-sticker">
          {he.cut.moreOfCut}
        </span>
        <span className="min-w-0 truncate text-[13px] font-bold">{text}</span>
      </div>
      <svg aria-hidden className="absolute inset-x-0 bottom-0 h-1 w-full overflow-visible">
        <line data-line x1="0" y1="2" x2="100%" y2="2" stroke="var(--color-ivory)" strokeWidth="2" strokeDasharray="7 5" />
      </svg>
      {/* the cut it leaves: it runs out both ways from where the blade bit */}
      <svg data-crack aria-hidden viewBox="0 0 300 8" preserveAspectRatio="none" className="absolute inset-x-0 -bottom-[3px] h-2 w-full origin-[25%_50%] overflow-visible">
        <path d="M0 4 L40 3 L70 5 L72 2 L75 6 L78 3 L110 4 L160 3 L210 5 L260 3 L300 4" fill="none" stroke="var(--color-ivory)" strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* the butcher's cleaver: blade (edge down) with its hole, the handle out to the side */}
      <svg data-cleaver viewBox="0 0 112 60" aria-hidden className="pointer-events-none absolute bottom-[2px] left-[12%] h-[54px] w-[100px] opacity-0">
        <path d="M2 4 Q2 2 4 2 H64 Q66 2 66 4 V58 H6 Q2 58 2 54 Z" fill="#dfe4e6" stroke="#111111" strokeWidth="3" strokeLinejoin="round" />
        <path d="M6 50 H62" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="16" cy="14" r="5" fill="#ffffff" stroke="#111111" strokeWidth="2.5" />
        <rect x="64" y="8" width="46" height="14" rx="6" fill="#111111" />
        <circle cx="78" cy="15" r="2.2" fill="#dfe4e6" /><circle cx="96" cy="15" r="2.2" fill="#dfe4e6" />
      </svg>
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
