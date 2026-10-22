"use client";
// One post = one cut (customer spec §5). In the feed it is a social post (design: V3, 22.10.2026): the shop and
// "חי מהדלפק", the cut and the butcher's word, the work video leading a landscape carousel, four facts, the price
// with "הוסף לסל", and more from the same counter. As the full post the media comes first, then the cut, its
// facts, the whole note and "הערכת הקצב", with buying left to the page's purchase bar.
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PostMedia } from "./PostMedia";
import { ShopMark } from "./ShopMark";
import { usePostView } from "./usePostView";
import { markSoldNotice } from "@/lib/impressions";
import { track } from "@/lib/track";
import { AddChooser } from "./PurchaseBar";
import { BottomSheet, Ltr } from "./ui";
import { IconAging, IconCheck, IconClock } from "./icons";
import { useToast } from "./Toast";
import { he } from "@/lib/i18n/he";
import { cart, useCart } from "@/lib/cart";
import { canBuySteaks, canBuyWhole, coverOf, cutTitle, mediaUrl, timeAgo } from "@/lib/cut-helpers";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { formatWeight, money, steakPrice, wholePrice } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia, CutWithMedia, OrderMode } from "@/lib/types";

export function CutPost({ cut, media, breeds, shop, now, variant = "feed", source = "feed", gone, reserved, eager, children, related }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; shop?: Pick<Butcher, "name" | "slug" | "logo_path"> | null; now: number;
  variant?: "feed" | "full";
  /** the full post only: what follows the post on its page (the certificate, the purchase bar) */
  children?: React.ReactNode;
  /** where the post is shown, for measurement (§15): feed / butcher / search / post */
  source?: "feed" | "butcher" | "search" | "post";
  /** sold while on screen: stays in place with the "אזל" stamp instead of vanishing (spec §4.3) */
  gone?: boolean;
  /** held by another customer at checkout right now: "שוריין", can't be added, may come back (spec §13) */
  reserved?: boolean;
  eager?: boolean;
  /** the feed post only: other cuts on the same counter, linked at the bottom */
  related?: CutWithMedia[];
}) {
  const full = variant === "full";
  const title = cutTitle(cut, breeds) || he.butcher.untitled;
  const href = `/cut/${cut.code}`;
  const wholeOk = canBuyWhole(cut);
  const steaksOk = canBuySteaks(cut);
  const soldOut = gone || cut.status === "sold_out" || (cut.status === "published" && !wholeOk && !steaksOk);
  const [open, setOpen] = useState(false);
  const { ref, visible } = usePostView<HTMLElement>(cut.id, { butcherId: cut.butcher_id, source: full ? "post" : source });
  // the one-time sold-out notice counts as given once the stamped post was actually in view
  useEffect(() => { if (gone && visible) markSoldNotice(cut.id); }, [gone, visible, cut.id]);
  const steaksSale = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const partlySold = !soldOut && steaksSale && cut.steaks_total > 0 && cut.steaks_available > 0 && cut.steaks_available < cut.steaks_total;

  const method = agingMethodLabel(cut.aging_method);
  const aged = cut.is_aged && cut.aging_days ? `${he.feed.agedDays(cut.aging_days)}${method ? ` · ${method}` : ""}` : null;
  const facts = [
    cut.origin_country ? originLabel(cut.origin_country) : null,
    cut.weight_g ? formatWeight(cut.weight_g) : null,
  ].filter(Boolean) as string[];

  const [kind, breed] = splitTitle(title);
  const state = soldOut ? "sold" : reserved ? "reserved" : null;
  const overlay = soldOut ? <SoldStamp code={cut.code} at={cut.sold_out_at} /> : reserved ? <ReservedBadge /> : null;

  // the feed post (design: V3, the founders' pick, 22.10.2026): like a social post — the shop and "חי מהדלפק", one
  // line of the cut and the butcher's word, the work video leading a landscape carousel, a strip of four facts,
  // the price with "הוסף לסל", then more from the same counter
  if (!full) {
    const factCells = [
      { k: he.cut.aging, v: cut.is_aged && cut.aging_days ? `${he.post.days(cut.aging_days)}${method ? ` · ${method}` : ""}` : he.post.notAged },
      { k: he.post.weightShort, v: cut.weight_g ? formatWeight(cut.weight_g) : "—" },
      { k: he.cut.pricePerKg, v: cut.price_per_kg_agorot ? money(cut.price_per_kg_agorot) : "—" },
      partlySold ? { k: he.post.leftShort, v: he.post.leftOf(cut.steaks_available, cut.steaks_total) } : { k: he.post.codeShort, v: <span className="code !text-[13px]">{cut.code}</span> },
    ];
    return (
      <article ref={ref} className="overflow-hidden rounded-[22px] bg-ink-2 text-start shadow-[var(--shadow-card)]">
        <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3 lg:px-[18px]">
          <header className="flex items-center gap-2.5">
            {shop && <Link href={shopPath(shop)} aria-label={shop.name}><ShopMark shop={shop} /></Link>}
            <div className="min-w-0 text-[13px] leading-[18px]">
              {shop && <Link href={shopPath(shop)} className="block truncate text-[15px] font-bold">{shop.name}</Link>}
              <span className={clsx(soldOut ? "font-bold text-sold" : reserved ? "font-bold text-gold" : "text-stone")}>
                {soldOut ? he.post.soldStamp : reserved ? he.post.reserved : cut.published_at ? timeAgo(cut.published_at, now) : null}
              </span>
              {!soldOut && !reserved && <span className="text-brand"> · <span className="inline-block size-1.5 rounded-full bg-brand align-middle" aria-hidden /> {he.live.fromCounter}</span>}
            </div>
          </header>
          <p className="m-0 text-[15px] leading-[22px]">
            <Link href={href} className="font-black">{kind}{breed && <> · {breed}</>}.</Link>
            {cut.description && <> {shortNote(cut.description)}</>}
          </p>
        </div>

        <PostMedia media={media} title={title} code={cut.code} href={href} eager={eager} state={state} videoFirst wide>{overlay}</PostMedia>

        <dl className="m-0 grid grid-cols-4 border-b border-line">
          {factCells.map((f) => (
            <div key={f.k} className="min-w-0 border-s border-line px-3 py-2.5 first:border-s-0 lg:px-3.5">
              <dt className="text-[11px] text-stone">{f.k}</dt>
              <dd className="m-0 truncate text-[15px] font-bold">{f.v}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-center gap-3 px-4 py-2.5 lg:px-[18px]">
          <Price cut={cut} muted={soldOut} />
          {shop && <Link href={shopPath(shop)} className="ms-auto hidden min-h-11 items-center px-2 text-sm font-medium sm:flex">{he.live.toShop}</Link>}
          <div className={clsx(!shop && "ms-auto", "max-sm:ms-auto")}>
            <AddPill cut={cut} soldOut={soldOut} reserved={!!reserved} onChoose={() => setOpen(true)} />
          </div>
        </div>

        {related && related.length > 0 && shop && (
          <div className="flex flex-col gap-2.5 border-t border-line px-4 pt-3 pb-4 lg:px-[18px]">
            <span className="text-[13px] font-bold">{he.live.more(shop.name)}</span>
            <ul className="no-scrollbar -mx-4 m-0 flex list-none gap-2.5 overflow-x-auto px-4 lg:-mx-[18px] lg:px-[18px]">
              {related.map((r) => <RelatedCut key={r.id} cut={r} breeds={breeds} />)}
            </ul>
          </div>
        )}

        {open && (
          <BottomSheet open dark title={he.post.chooseTitle} onClose={() => setOpen(false)}>
            <AddSheet cut={cut} onDone={() => setOpen(false)} />
          </BottomSheet>
        )}
      </article>
    );
  }

  // the full post opens on its media, edge to edge (design: Cut); on a wide screen the media stays on one side
  // while the details and buying scroll beside it
  return (
    <article ref={ref} className="flex flex-col text-start lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:pt-16">
      <div className="lg:sticky lg:top-20 lg:overflow-hidden lg:rounded-3xl">
        <PostMedia media={media} title={title} code={cut.code} eager={eager} state={state}>{overlay}</PostMedia>
      </div>

      <div className="flex flex-col gap-3 px-4 pt-5 lg:px-0 lg:pt-0">
        <header className="sr-post__head">
          {shop && <Link href={shopPath(shop)} aria-label={shop.name}><ShopMark shop={shop} /></Link>}
          <div className="min-w-0">
            {shop && <Link href={shopPath(shop)} className="sr-post__shop block truncate">{shop.name}</Link>}
            <div className={clsx("sr-post__when", soldOut && "sr-post__when--sold", !soldOut && reserved && "sr-post__when--reserved")}>
              {soldOut ? he.post.soldStamp : reserved ? he.post.reserved : cut.published_at ? timeAgo(cut.published_at, now) : null}
            </div>
          </div>
        </header>

        <h1 className="m-0 font-display text-[30px] font-black leading-9">{kind}{breed && <span className="font-normal text-stone"> · {breed}</span>}</h1>

        {(aged || facts.length > 0 || partlySold) && (
          <div className="sr-chips">
            {aged && <span className="sr-chip sr-chip--aging"><IconAging className="size-3.5" />{aged}</span>}
            {facts.map((f) => <span key={f} className="sr-chip">{f}</span>)}
            {partlySold && (
              <span key={cut.steaks_available} className="sr-chip sr-chip--left animate-fade-in">{he.post.left(cut.steaks_available, cut.steaks_total)}</span>
            )}
          </div>
        )}
        {cut.description && <Note text={cut.description} />}
        {cut.butcher_marbling ? <Marbling n={cut.butcher_marbling} /> : null}
        {children}
      </div>
    </article>
  );
}

/** "אנטריקוט · בלאק אנגוס" → the cut in the serif, the breed after it, quieter. */
function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf(" · ");
  return i < 0 ? [title, null] : [title.slice(0, i), title.slice(i + 3)];
}

/** "מילה מהקצב" (design system: ButcherNote): a gold rule and a gold head, the butcher's words, three lines then "עוד". */
function Note({ text }: { text: string }) {
  return (
    <div className="sr-note">
      <span className="sr-eyebrow">{he.post.fromButcher}</span>
      <p className="whitespace-pre-line [display:block!important]">{text}</p>
    </div>
  );
}

/** The butcher's marbling estimate (design system: MarblingScale): ten marks, always called "הערכת הקצב". */
function Marbling({ n }: { n: number }) {
  return (
    <div className="sr-marbling" role="img" aria-label={he.post.marbling(n)}>
      <span className="sr-marbling__bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? "on" : undefined} />)}
      </span>
      <span className="sr-marbling__label">{he.post.marblingWord} <b className="ltr">{n}/10</b> · {he.post.marblingFull}</span>
    </div>
  );
}

/** What one unit costs: a steak ("₪66 לסטייק") or the whole cut. */
function Price({ cut, muted }: { cut: Cut; muted?: boolean }) {
  if (!cut.price_per_kg_agorot) return null;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steak_weight_g;
  const unit = steaks ? steakPrice(cut.steak_weight_g!, cut.price_per_kg_agorot) : cut.weight_g ? wholePrice(cut.weight_g, cut.price_per_kg_agorot) : null;
  if (unit == null) return null;
  return (
    <span className={clsx("sr-price", muted && "text-stone")}>
      <Ltr>{money(unit)}</Ltr> <small>{steaks ? he.post.perSteakShort : he.post.wholeShort}</small>
    </span>
  );
}

function AddSheet({ cut, onDone }: { cut: Cut; onDone: () => void }) {
  const toast = useToast();
  const line = useCart().find((l) => l.cutId === cut.id);
  const onOrder = (mode: OrderMode, qty: number | null, total: number) => {
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode, qty, estAgorot: total });
    track("add_to_cart", { cut_id: cut.id, mode, qty, source: "feed", price: total });
    toast(line ? he.cart.updated : he.cart.added, { tone: "success" });
    onDone();
  };
  return <AddChooser cut={cut} onOrder={onOrder} inCart={!!line} initialMode={line?.mode} initialQty={line?.qty} />;
}

/** On the photo of a cut someone holds at checkout (design system: PostStates): gold, with a clock. */
function ReservedBadge() {
  return (
    <span className="sr-badge-reserved animate-fade-in pointer-events-none"><IconClock className="size-3.5" />{he.post.reserved}</span>
  );
}

/** "אזל" as a meat-inspection stamp (design system: SoldStamp): a double oval in rose ink, the cut's code and the day. */
function SoldStamp({ code, at }: { code: string; at: string | null }) {
  const d = new Date(at ?? Date.now());
  const day = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return (
    <div className="sr-stamp" role="img" aria-label={he.post.soldStamp}>
      <div className="sr-stamp__ink stamp-land">
        <div>
          <span className="sr-stamp__word">{he.post.soldStamp}</span>
          <span className="sr-stamp__meta">{code} · {day}</span>
        </div>
      </div>
    </div>
  );
}

/** The feed's add button (design: V3): a red pill that says what it does, or why it can't. */
function AddPill({ cut, soldOut, reserved, onChoose }: { cut: Cut; soldOut: boolean; reserved: boolean; onChoose: () => void }) {
  const toast = useToast();
  const inCart = useCart().some((l) => l.cutId === cut.id);
  const direct = cut.sale_mode === "whole";
  const cls = "sr-btn !min-h-[46px] !px-5 !text-[15px] !font-bold";
  if (soldOut || reserved) return <button type="button" disabled className={cls}>{soldOut ? he.post.soldStamp : he.post.reserved}</button>;
  if (direct && inCart) return <button type="button" disabled className={clsx(cls, "sr-btn--quiet")}><IconCheck className="size-5" />{he.post.inCart}</button>;
  const add = () => {
    if (!direct) return onChoose();
    if (!cut.weight_g || !cut.price_per_kg_agorot) return;
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode: "whole", qty: null,
      estAgorot: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    track("add_to_cart", { cut_id: cut.id, mode: "whole", source: "feed", price: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    toast(he.cart.added, { tone: "success" });
  };
  return (
    <button type="button" onClick={add} className={clsx(cls, inCart && "sr-btn--quiet")}>
      {inCart ? <><IconCheck className="size-5" />{he.post.inCart}</> : he.cart.add}
    </button>
  );
}

/** One linked cut at the bottom of a post: a small landscape photo, the cut and its unit price. */
function RelatedCut({ cut, breeds }: { cut: CutWithMedia; breeds: Breed[] }) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  return (
    <li className="shrink-0">
      <Link href={`/cut/${cut.code}`} className="flex w-[200px] items-center gap-2.5 rounded-[14px] bg-ink-3 p-1.5">
        <span className="block h-12 w-16 shrink-0 overflow-hidden rounded-[10px] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 text-[13px] leading-[17px]">
          <span className="block truncate font-medium">{title}</span>
          <span className="text-brand"><UnitPrice cut={cut} /></span>
        </span>
      </Link>
    </li>
  );
}

function UnitPrice({ cut }: { cut: Cut }) {
  if (!cut.price_per_kg_agorot) return null;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steak_weight_g;
  const unit = steaks ? steakPrice(cut.steak_weight_g!, cut.price_per_kg_agorot) : cut.weight_g ? wholePrice(cut.weight_g, cut.price_per_kg_agorot) : null;
  return unit == null ? null : <><Ltr>{money(unit)}</Ltr> {steaks ? he.post.perSteakShort : he.post.wholeShort}</>;
}

/** The butcher's word cut to one line's worth for the feed; the full post shows all of it. */
function shortNote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 118).trimEnd()}…` : t;
}
