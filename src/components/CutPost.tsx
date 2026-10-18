"use client";
// One post = one cut (customer spec §5). The same component in the feed, on a shop's page and as the full post,
// laid out like the founders' reference (a social-feed post, 18.10.2026): header (the shop's mark and name, time
// since it went live), the text aligned to the start (cut, facts, the butcher's note, "הערכת הקצב"), the media edge
// to edge, and — in the feed — an order strip with "הוסף לסל". In the feed the media is a collage (PostCollage);
// the full post swipes through it (PostMedia), shows the whole note and leaves buying to the page's purchase bar.
import { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PostCollage } from "./PostCollage";
import { PostMedia } from "./PostMedia";
import { ShopMark } from "./ShopMark";
import { usePostView } from "./usePostView";
import { markSoldNotice } from "@/lib/impressions";
import { track } from "@/lib/track";
import { PurchaseBar } from "./PurchaseBar";
import { BottomSheet, Button, Ltr } from "./ui";
import { useToast } from "./Toast";
import { he } from "@/lib/i18n/he";
import { cart, useCart } from "@/lib/cart";
import { canBuySteaks, canBuyWhole, cutTitle, timeAgo } from "@/lib/cut-helpers";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { formatAgorot, formatWeight, steakPrice, wholePrice } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia, OrderMode } from "@/lib/types";

const money = (a: number) => `₪${formatAgorot(a).replace(/\.00$/, "")}`;

export function CutPost({ cut, media, breeds, shop, now, variant = "feed", source = "feed", gone, reserved, eager }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; shop?: Pick<Butcher, "name" | "slug" | "logo_path"> | null; now: number;
  variant?: "feed" | "full";
  /** where the post is shown, for measurement (§15): feed / butcher / post */
  source?: "feed" | "butcher" | "post";
  /** sold while on screen: stays in place with the "אזל" stamp instead of vanishing (spec §4.3) */
  gone?: boolean;
  /** held by another customer at checkout right now: "שוריין", can't be added, may come back (spec §13) */
  reserved?: boolean;
  eager?: boolean;
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

  return (
    // in the feed each post is a warm card of its own; the full post stays edge to edge
    <article ref={ref} className={clsx("text-start", !full && "overflow-hidden rounded-[28px] bg-gradient-to-b from-ink-2 to-[#130f0c] pt-4 shadow-[0_18px_40px_-22px_rgb(0_0_0/0.9)] ring-1 ring-gold/15")}>
      {/* 1 · header */}
      <header className="flex items-center gap-3 px-4 pb-3">
        {shop && (
          <Link href={shopPath(shop)} aria-label={shop.name} className="shrink-0 rounded-full bg-gradient-to-br from-gold via-[#e7cfa3] to-brand p-[2px]">
            <ShopMark shop={shop} className="size-10 text-base ring-2 ring-ink-2" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {shop && <Link href={shopPath(shop)} className="block truncate text-[15px] font-bold text-ivory">{shop.name}</Link>}
          <p className="text-xs text-stone">
            {soldOut ? <span className="font-semibold text-[#e8a0a8]">{he.post.soldStamp}</span>
              : reserved ? <span className="font-semibold text-gold">{he.post.reserved}</span>
              : cut.published_at ? timeAgo(cut.published_at, now) : null}
          </p>
        </div>
      </header>

      {/* 2 · text */}
      <div className="px-4 pb-3">
        {full ? <h1 className="font-display text-[28px] font-bold leading-tight text-ivory">{title}</h1>
          : <h2 className="font-display text-[19px] font-bold leading-snug text-ivory"><Link href={href}>{title}</Link></h2>}
        {(aged || facts.length > 0 || partlySold) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {aged && <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[12.5px] font-semibold text-gold ring-1 ring-gold/30">{aged}</span>}
            {facts.map((f) => <span key={f} className="rounded-full bg-ivory/[0.06] px-2.5 py-1 text-[12.5px] text-ivory/80">{f}</span>)}
            {partlySold && (
              <span key={cut.steaks_available} className="animate-fade-in rounded-full bg-brand/20 px-2.5 py-1 text-[12.5px] font-semibold text-[#f0b8bf] ring-1 ring-brand/40">
                {he.post.left(cut.steaks_available, cut.steaks_total)}
              </span>
            )}
          </div>
        )}
        {cut.description && <Note text={cut.description} full={full} />}
        {cut.butcher_marbling ? <Marbling n={cut.butcher_marbling} /> : null}
        {!full && (
          <Link href={href} className="mt-1.5 inline-block min-h-9 py-1.5 text-[15px] font-semibold text-gold underline-offset-4 hover:underline">
            {he.post.certificate}
          </Link>
        )}
      </div>

      {/* 3 · media, edge to edge */}
      {full ? (
        <PostMedia media={media} title={title} code={cut.code} eager={eager}>{soldOut ? <SoldStamp /> : reserved && <ReservedTag />}</PostMedia>
      ) : (
        <div className="px-3">
          <div className="overflow-hidden rounded-2xl">
            <PostCollage media={media} title={title} code={cut.code} href={href} eager={eager}>{soldOut ? <SoldStamp /> : reserved && <ReservedTag />}</PostCollage>
          </div>
        </div>
      )}

      {/* 4 · order strip (the full post has the sticky purchase bar instead) */}
      {!full && (
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-ivory/[0.06] bg-black/20 px-4 py-3">
          <div className="min-w-0">
            <Price cut={cut} />
            <p className="truncate text-xs text-stone">
              {shop ? he.post.orderFrom(shop.name) : null}{shop ? "  ·  " : ""}<Ltr className="tracking-wider">{cut.code}</Ltr>
            </p>
          </div>
          <AddButton cut={cut} disabled={soldOut || !!reserved} onChoose={() => setOpen(true)} />
        </div>
      )}

      {!full && open && (
        <BottomSheet open dark title={he.post.chooseTitle} onClose={() => setOpen(false)}>
          <AddSheet cut={cut} onDone={() => setOpen(false)} />
        </BottomSheet>
      )}
    </article>
  );
}

/** The butcher's own words, set apart like a note handed over the counter. */
function Note({ text, full }: { text: string; full: boolean }) {
  const [more, setMore] = useState(false);
  const long = text.length > 140 || text.split("\n").length > 3;
  return (
    <div className="mt-3 rounded-2xl border-s-2 border-gold/60 bg-ivory/[0.035] px-3.5 py-2.5">
      <p className="text-[11px] font-semibold tracking-wide text-gold">{he.post.fromButcher}</p>
      <p className={clsx("mt-0.5 whitespace-pre-line text-[15px] leading-relaxed text-ivory/90", !full && !more && "line-clamp-3")}>{text}</p>
      {!full && long && (
        <button type="button" onClick={() => setMore((m) => !m)} className="min-h-8 text-sm font-semibold text-stone">
          {more ? he.post.less : he.post.more}
        </button>
      )}
    </div>
  );
}

/** "הערכת הקצב" as ten small marks — the butcher's own estimate, labelled as such (spec §5.2). */
function Marbling({ n }: { n: number }) {
  return (
    <div className="mt-2.5 flex items-center gap-2" role="img" aria-label={he.post.marbling(n)}>
      <span className="text-xs text-stone">{he.post.marblingLabel}</span>
      <span className="flex gap-[3px]" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={clsx("h-2.5 w-1.5 rounded-full", i < n ? "bg-gradient-to-t from-brand to-[#e7a4a0]" : "bg-ivory/10")} />
        ))}
      </span>
      <Ltr className="text-xs font-semibold text-ivory/80">{n}/10</Ltr>
    </div>
  );
}

function Price({ cut }: { cut: Cut }) {
  if (!cut.price_per_kg_agorot) return null;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steak_weight_g;
  const unit = steaks
    ? `${he.post.from}${money(steakPrice(cut.steak_weight_g!, cut.price_per_kg_agorot))}`
    : cut.weight_g ? money(wholePrice(cut.weight_g, cut.price_per_kg_agorot)) : null;
  return (
    <p className="text-ivory">
      {unit && <span className="font-display text-lg font-bold"><Ltr>{unit}</Ltr></span>}
      <span className="ms-2 text-sm text-stone"><Ltr>{money(cut.price_per_kg_agorot)}</Ltr> {he.feed.perKg}</span>
    </p>
  );
}

function AddButton({ cut, disabled, onChoose }: { cut: Cut; disabled: boolean; onChoose: () => void }) {
  const toast = useToast();
  const inCart = useCart().some((l) => l.cutId === cut.id);
  // one fixed unit (a whole cut sold only whole) goes straight in; anything with a choice opens the sheet
  const direct = cut.sale_mode === "whole";
  const add = () => {
    if (!direct) return onChoose();
    if (!cut.weight_g || !cut.price_per_kg_agorot) return;
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode: "whole", qty: null,
      estAgorot: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    track("add_to_cart", { cut_id: cut.id, mode: "whole", source: "feed", price: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    toast(he.cart.added, { tone: "success" });
  };
  return (
    <Button size="md" variant={inCart ? "dark" : "primary"} disabled={disabled || (direct && inCart)} onClick={add}
      className="shrink-0 rounded-full px-5 shadow-[0_6px_18px_-6px_rgb(163_18_42/0.7)]">
      {inCart ? he.post.inCart : he.post.addToCart}
    </Button>
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
  return <PurchaseBar cut={cut} inline onOrder={onOrder} inCart={!!line} initialMode={line?.mode} initialQty={line?.qty} />;
}

function ReservedTag() {
  return (
    <span className="animate-fade-in pointer-events-none absolute top-3 start-3 rounded-full bg-ink/80 px-3 py-1.5 text-sm font-semibold text-gold ring-1 ring-gold/50 backdrop-blur-sm">
      {he.post.reserved}
    </span>
  );
}

function SoldStamp() {
  return (
    <div className="animate-fade-in pointer-events-none absolute inset-0 grid place-items-center bg-black/35 backdrop-grayscale-[0.8]">
      <span className="-rotate-12">
        <span className="animate-busted block border-2 border-[#e8a0a8] px-5 py-1.5 font-display text-3xl font-bold tracking-widest text-[#e8a0a8]">
          {he.post.soldStamp}
        </span>
      </span>
    </div>
  );
}
