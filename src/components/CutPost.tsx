"use client";
// One post = one sale item (customer spec §5, BUTCHER_FLOW §6): a ready unit or the remainder of a parent cut. It is
// a social post (design: V3, 22.10.2026): the shop and "חי מהדלפק", the cut, which part of it this is and the
// butcher's word, the cutting video leading a landscape carousel, four facts, the price with "הוסף לסל", and more
// from the same counter. Tapping it opens the parent's page at this item. With `preview` it is the butcher's
// ItemPreviewCard (§9.4): exactly what the customer will see, nothing acts.
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PostMedia } from "./PostMedia";
import { ShopMark } from "./ShopMark";
import { usePostView } from "./usePostView";
import { markSoldNotice } from "@/lib/impressions";
import { track } from "@/lib/track";
import { RemainderChooser, type OnOrder } from "./ItemBuy";
import { BottomSheet, Ltr } from "./ui";
import { IconCheck, IconClock } from "./icons";
import { useToast } from "./Toast";
import { he } from "@/lib/i18n/he";
import { cart, useCart } from "@/lib/cart";
import { coverOf, cutTitle, mediaUrl, timeAgo } from "@/lib/cut-helpers";
import { isAvailable, linePrice, parentPath, type Held } from "@/lib/items";
import { agingMethodLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { formatWeight, money } from "@/lib/pricing";
import type { Breed, Butcher, SaleItem } from "@/lib/types";

export function CutPost({ cut, breeds, shop, now, source = "feed", gone, reserved, held, eager, related, preview, onPriceTap }: {
  cut: SaleItem; breeds: Breed[]; shop?: Pick<Butcher, "name" | "slug" | "logo_path"> | null; now: number;
  /** where the post is shown, for measurement (§15): feed / butcher / search */
  source?: "feed" | "butcher" | "search";
  /** sold while on screen: stays in place with the "אזל" stamp instead of vanishing (spec §4.3) */
  gone?: boolean;
  /** held by another customer at checkout right now: "שוריין", can't be added, may come back (spec §13) */
  reserved?: boolean;
  /** what others hold of it (a remainder's free grams) */
  held?: Held;
  eager?: boolean;
  /** other items on the same counter, linked at the bottom */
  related?: SaleItem[];
  /** the butcher's preview before "אשר והעלה" */
  preview?: boolean;
  /** preview only: tapping the price changes it for this item (R11) */
  onPriceTap?: () => void;
}) {
  const title = cutTitle(cut, breeds) || he.butcher.untitled;
  const href = parentPath(cut.parent_code, cut.label);
  const soldOut = !preview && (gone || !isAvailable(cut));
  const [open, setOpen] = useState(false);
  const { ref, visible } = usePostView<HTMLElement>(cut.id, { butcherId: cut.butcher_id, source });
  // the one-time sold-out notice counts as given once the stamped post was actually in view
  useEffect(() => { if (gone && visible) markSoldNotice(cut.id); }, [gone, visible, cut.id]);

  const method = agingMethodLabel(cut.aging_method);
  const [kind, breed] = splitTitle(title);
  const state = soldOut ? "sold" : reserved ? "reserved" : null;
  const overlay = soldOut ? <SoldStamp code={cut.code} at={cut.sold_out_at} /> : reserved ? <ReservedBadge /> : null;
  const part = cut.kind === "unit"
    ? `${he.item.unit(cut.label)}${cut.steak_count ? ` · ${he.item.steaks(cut.steak_count)}` : ""}`
    : cut.split ? `${he.item.remainder} · ${he.item.canSlice}` : he.item.wholeByWeight;
  const Wrap = preview ? "span" : Link;

  const factCells = [
    { k: he.cut.aging, v: cut.is_aged && cut.aging_days ? `${he.post.days(cut.aging_days)}${method ? ` · ${method}` : ""}` : he.post.notAged },
    { k: cut.kind === "remainder" ? he.post.leftShort : he.post.weightShort, v: cut.weight_g ? formatWeight(cut.weight_g) : "—" },
    { k: he.cut.pricePerKg, v: cut.price_per_kg_agorot ? money(cut.price_per_kg_agorot) : "—" },
    { k: he.post.codeShort, v: <span className="code !text-[12px] whitespace-nowrap">{cut.code}</span> },
  ];
  return (
    <article ref={ref} id={`post-${cut.id}`} className="overflow-hidden rounded-[22px] bg-ink-2 text-start shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-2 px-4 pt-3.5 pb-3 lg:px-[18px]">
        <header className="flex items-center gap-2.5">
          {shop && <Wrap href={shopPath(shop)} aria-label={shop.name}><ShopMark shop={shop} /></Wrap>}
          <div className="min-w-0 text-[13px] leading-[18px]">
            {shop && <Wrap href={shopPath(shop)} className="block truncate text-[15px] font-bold">{shop.name}</Wrap>}
            <span className={clsx(soldOut ? "font-bold text-sold" : reserved ? "font-bold text-gold" : "text-stone")}>
              {soldOut ? he.post.soldStamp : reserved ? he.post.reserved : timeAgo(cut.published_at ?? new Date(now).toISOString(), now)}
            </span>
            {!soldOut && !reserved && <span className="text-brand"> · <span className="inline-block size-1.5 rounded-full bg-brand align-middle" aria-hidden /> {he.live.fromCounter}</span>}
          </div>
        </header>
        <p className="m-0 text-[15px] leading-[22px]">
          <Wrap href={href} className="font-black">{kind}{breed && <> · {breed}</>}.</Wrap>{" "}
          <span className="font-medium">{part}.</span>
          {cut.description && <> {shortNote(cut.description)}</>}
        </p>
      </div>

      <PostMedia media={cut.cut_media} title={title} code={cut.code} href={preview ? undefined : href} eager={eager} state={state} videoFirst wide>{overlay}</PostMedia>

      <dl className="m-0 grid grid-cols-4 border-b border-line">
        {factCells.map((f) => (
          <div key={f.k} className="min-w-0 border-s border-line px-3 py-2.5 first:border-s-0 lg:px-3.5">
            <dt className="text-[11px] text-stone">{f.k}</dt>
            <dd className="m-0 text-[15px] leading-5 font-bold">{f.v}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center gap-3 px-4 py-2.5 lg:px-[18px]">
        {onPriceTap
          ? <button type="button" onClick={onPriceTap} className="rounded-lg underline decoration-dashed underline-offset-4"><Price cut={cut} /></button>
          : <Price cut={cut} muted={soldOut} />}
        {shop && !preview && <Link href={href} className="ms-auto hidden min-h-11 items-center px-2 text-sm font-medium sm:flex">{he.item.toPage}</Link>}
        <div className={clsx((!shop || preview) && "ms-auto", "max-sm:ms-auto")}>
          <AddPill cut={cut} soldOut={soldOut} reserved={!!reserved} preview={preview} onChoose={() => setOpen(true)} />
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
        <BottomSheet open dark title={cut.split ? he.item.fromRemainder : he.item.wholeByWeight} onClose={() => setOpen(false)}>
          <AddSheet cut={cut} held={held} onDone={() => setOpen(false)} />
        </BottomSheet>
      )}
    </article>
  );
}

/** "אנטריקוט · בלאק אנגוס" → the cut in the serif, the breed after it, quieter. */
function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf(" · ");
  return i < 0 ? [title, null] : [title.slice(0, i), title.slice(i + 3)];
}

/** A unit's price ("₪272.80 ליחידה"), or a remainder's price per kg. */
function Price({ cut, muted }: { cut: SaleItem; muted?: boolean }) {
  if (!cut.price_per_kg_agorot) return null;
  const unit = cut.kind === "unit";
  return (
    <span className={clsx("sr-price", muted && "text-stone")}>
      <Ltr>{money(unit ? linePrice(cut, "unit") : cut.price_per_kg_agorot)}</Ltr> <small>{unit ? he.item.unit(cut.label) : he.item.perKg}</small>
    </span>
  );
}

/** Puts a line in the cart and says so (the feed, the parent's page). */
export function useAddToCart(source: "feed" | "post") {
  const toast = useToast();
  const lines = useCart();
  return (cut: SaleItem, ...[mode, grams, thicknessCm, total]: Parameters<OnOrder>) => {
    const had = lines.some((l) => l.itemId === cut.id);
    cart.put({ itemId: cut.id, code: cut.code, parentCode: cut.parent_code, butcherId: cut.butcher_id, mode, grams, thicknessCm, estAgorot: total });
    track("add_to_cart", { item_id: cut.id, mode, grams, source, price: total });
    toast(had ? he.cart.updated : he.cart.added, { tone: "success" });
  };
}

function AddSheet({ cut, held, onDone }: { cut: SaleItem; held?: Held; onDone: () => void }) {
  const line = useCart().find((l) => l.itemId === cut.id);
  const add = useAddToCart("feed");
  return (
    <RemainderChooser item={cut} held={held} inCart={!!line} initial={line}
      onOrder={(...a) => { add(cut, ...a); onDone(); }} />
  );
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

/** The feed's add button (design: V3): a red pill that says what it does, or why it can't. A unit goes straight
 * into the cart; a remainder opens the choice of all of it or a slice. */
function AddPill({ cut, soldOut, reserved, preview, onChoose }: {
  cut: SaleItem; soldOut: boolean; reserved: boolean; preview?: boolean; onChoose: () => void;
}) {
  const inCart = useCart().some((l) => l.itemId === cut.id);
  const add = useAddToCart("feed");
  const unit = cut.kind === "unit";
  const cls = "sr-btn !min-h-[46px] !px-5 !text-[15px] !font-bold";
  if (preview) return <button type="button" tabIndex={-1} className={cls}>{he.cart.add}</button>;
  if (soldOut || reserved) return <button type="button" disabled className={cls}>{soldOut ? he.post.soldStamp : he.post.reserved}</button>;
  if (unit && inCart) return <button type="button" disabled className={clsx(cls, "sr-btn--quiet")}><IconCheck className="size-5" />{he.post.inCart}</button>;
  const onClick = () => (unit ? add(cut, "unit", null, null, linePrice(cut, "unit")) : onChoose());
  return (
    <button type="button" onClick={onClick} className={clsx(cls, inCart && "sr-btn--quiet")}>
      {inCart ? <><IconCheck className="size-5" />{he.post.inCart}</> : he.cart.add}
    </button>
  );
}

/** One linked cut at the bottom of a post: a small landscape photo, the cut and its unit price. */
function RelatedCut({ cut, breeds }: { cut: SaleItem; breeds: Breed[] }) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  return (
    <li className="shrink-0">
      <Link href={parentPath(cut.parent_code, cut.label)} className="flex w-[200px] items-center gap-2.5 rounded-[14px] bg-ink-3 p-1.5">
        <span className="block h-12 w-16 shrink-0 overflow-hidden rounded-[10px] bg-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 text-[13px] leading-[17px]">
          <span className="block truncate font-medium">{title} <span className="text-stone">{cut.label}</span></span>
          <span className="text-brand"><UnitPrice cut={cut} /></span>
        </span>
      </Link>
    </li>
  );
}

function UnitPrice({ cut }: { cut: SaleItem }) {
  if (!cut.price_per_kg_agorot) return null;
  return cut.kind === "unit"
    ? <Ltr>{money(linePrice(cut, "unit"))}</Ltr>
    : <><Ltr>{money(cut.price_per_kg_agorot)}</Ltr> {he.item.perKg}</>;
}

/** The butcher's word cut to one line's worth for the feed; the full post shows all of it. */
function shortNote(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > 120 ? `${t.slice(0, 118).trimEnd()}…` : t;
}
