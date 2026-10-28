"use client";
// What was cut from the cut, always in sight under it (founders 28.10.2026, "בר 1"): the cut's video and photo swipe
// side to side above; here a "חלק ממני" line, the knife running along it, and the trays as small cards in a row that
// scrolls sideways — each with its photo, number, steaks, weight, price and its own add. The cards slide in once as
// the row comes on screen. With reduced motion everything is simply in place.
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
  const row = useRef<HTMLUListElement>(null);
  const [viewer, setViewer] = useState<SaleItem | null>(null);
  const key = trays.map((t) => t.id).join(",");

  useIsoLayoutEffect(() => {
    const el = row.current;
    if (!el || reducedMotion()) return;
    const { gsap } = motion();
    const ctx = gsap.context(() => {
      gsap.from(el.children, {
        x: -60, opacity: 0, rotate: -3, duration: 0.55, ease: "back.out(1.6)", stagger: 0.08,
        scrollTrigger: { trigger: el, start: "top 92%", once: true },
      });
    }, el);
    return () => ctx.revert();
  }, [key]);

  if (!trays.length) return null;
  return (
    <section aria-label={he.item.cutFrom(trays.length)} className="flex flex-col gap-2">
      <PartOfMe text={he.cut.partBar(trays.length, no, block)} />
      <ul ref={row} className="no-scrollbar -mx-3 m-0 flex list-none snap-x gap-2.5 overflow-x-auto px-3 pt-1 pb-1.5 lg:-mx-4 lg:px-4">
        {trays.map((t) => {
          const cover = coverOf(t.cut_media);
          const sold = !isAvailable(t);
          const img = cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" loading="lazy" className="size-full object-cover" />
            : null;
          const photo = "block h-[86px] w-full overflow-hidden bg-ink-3";
          return (
            <li key={t.id} id={href ? undefined : `i-${t.label}`}
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

/** The "חלק ממני" line (founders' pick, 25.10.2026, made small for the row): the red sticker and what is in the row,
 * a knife running along the dashed cutting line under them. Once, as it scrolls in. */
function PartOfMe({ text }: { text: string }) {
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
      gsap.timeline({ scrollTrigger: { trigger: el, start: "top 90%", once: true } })
        .to(q("[data-knife]"), { x: () => -(el.offsetWidth - 48), duration: 0.9, ease: "power2.inOut" })
        .to(q("[data-line]"), { opacity: 1, duration: 0.9, ease: "none" }, 0)
        .to(q("[data-knife]"), { opacity: 0, duration: 0.2 })
        .to(q("[data-sticker]"), { scale: 1, rotate: -3, duration: 0.45, ease: "back.out(3)" }, 0.35);
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={root} className="relative pb-2.5">
      <div className="flex items-center gap-2">
        <span data-sticker className="-rotate-3 rounded-lg border-2 border-[#111111] bg-[#7a1020] px-2.5 text-[15px] leading-[22px] font-black text-sticker">
          {he.cut.partOfMe}
        </span>
        <span className="min-w-0 truncate text-[13px] font-bold">{text}</span>
      </div>
      <svg aria-hidden className="absolute inset-x-0 bottom-0 h-1 w-full overflow-visible">
        <line data-line x1="0" y1="2" x2="100%" y2="2" stroke="var(--color-ivory)" strokeWidth="2" strokeDasharray="7 5" />
      </svg>
      <svg data-knife viewBox="0 0 60 24" aria-hidden className="absolute -bottom-2.5 right-0 h-5 w-[50px] opacity-0">
        <path d="M2 12 L36 4 L40 12 L36 20 Z" fill="#D8DEE0" stroke="#111111" strokeWidth="2" />
        <rect x="38" y="8" width="20" height="8" rx="3" fill="#8B5A2B" stroke="#111111" strokeWidth="2" />
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
