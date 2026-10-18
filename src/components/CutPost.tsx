"use client";
// One post = one cut (customer spec §5). The same component in the feed, on a shop's page and as the full post:
// header (shop, time since it went live, state), text (cut, facts, the butcher's note, "הערכת הקצב"), the media
// carousel and — in the feed — the purchase row with "הוסף לסל". The full post shows the whole note and leaves
// buying to the page's purchase bar.
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PostMedia } from "./PostMedia";
import { ShopMark } from "./ShopMark";
import { PurchaseBar } from "./PurchaseBar";
import { BottomSheet, Button, Ltr } from "./ui";
import { useToast } from "./Toast";
import { he } from "@/lib/i18n/he";
import { cart, useCart } from "@/lib/cart";
import { canBuySteaks, canBuyWhole, cutTitle, mediaUrl, timeAgo } from "@/lib/cut-helpers";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { formatAgorot, formatWeight, steakPrice, wholePrice } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia, OrderMode } from "@/lib/types";

const money = (a: number) => `₪${formatAgorot(a).replace(/\.00$/, "")}`;

export function CutPost({ cut, media, breeds, shop, now, variant = "feed", gone, eager }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; shop?: Pick<Butcher, "name" | "slug" | "logo_path"> | null; now: number;
  variant?: "feed" | "full";
  /** sold while on screen: stays in place with the "אזל" stamp instead of vanishing (spec §4.3) */
  gone?: boolean;
  eager?: boolean;
}) {
  const full = variant === "full";
  const title = cutTitle(cut, breeds) || he.butcher.untitled;
  const href = `/cut/${cut.code}`;
  const wholeOk = canBuyWhole(cut);
  const steaksOk = canBuySteaks(cut);
  const soldOut = gone || cut.status === "sold_out" || (cut.status === "published" && !wholeOk && !steaksOk);
  const [open, setOpen] = useState(false);

  const facts = [
    cut.is_aged && cut.aging_days ? he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method)) : null,
    cut.origin_country ? originLabel(cut.origin_country) : null,
    cut.weight_g ? formatWeight(cut.weight_g) : null,
  ].filter(Boolean) as string[];

  return (
    <article className="text-center">
      {/* 1 · header */}
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        {shop ? (
          <Link href={shopPath(shop)} className="flex min-w-0 items-center gap-2.5">
            <ShopMark shop={shop} />
            <span className="truncate text-[15px] font-semibold text-ivory">{shop.name}</span>
          </Link>
        ) : <span />}
        <span className="shrink-0 text-xs text-stone">
          {soldOut ? <span className="font-semibold text-[#e8a0a8]">{he.post.soldStamp}</span>
            : cut.published_at ? timeAgo(cut.published_at, now) : null}
        </span>
      </header>

      {/* 2 · text */}
      <div className="mb-3 px-1">
        {full ? <h1 className="font-display text-[30px] font-bold leading-tight text-ivory">{title}</h1>
          : <h2 className="font-display text-[22px] font-bold leading-tight text-ivory"><Link href={href}>{title}</Link></h2>}
        {facts.length > 0 && <p className="mt-1 text-[15px] text-stone">{facts.join("  ·  ")}</p>}
        {cut.description && <Note text={cut.description} full={full} />}
        {cut.butcher_marbling ? <p className="mt-2 text-xs text-stone">{he.post.marbling(cut.butcher_marbling)}</p> : null}
      </div>

      {/* 3 · media */}
      <PostMedia media={media} title={title} code={cut.code} href={full ? undefined : href} eager={eager}>
        {soldOut && <SoldStamp />}
      </PostMedia>

      {/* 4 · purchase row (the full post has the sticky purchase bar instead) */}
      {!full && (
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <div className="min-w-0 text-start">
            <Price cut={cut} />
            <p className="truncate text-xs text-stone">
              <Ltr className="tracking-wider">{cut.code}</Ltr>  ·  <Link href={href} className="text-gold underline-offset-4 hover:underline">{he.post.certificate}</Link>
            </p>
          </div>
          <AddButton cut={cut} disabled={soldOut} onChoose={() => setOpen(true)} />
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

function Note({ text, full }: { text: string; full: boolean }) {
  const [more, setMore] = useState(false);
  const long = text.length > 140 || text.split("\n").length > 3;
  return (
    <div className="mt-2">
      <p className={clsx("whitespace-pre-line font-display text-[16px] leading-relaxed text-ivory/85", !full && !more && "line-clamp-3")}>{text}</p>
      {!full && long && (
        <button type="button" onClick={() => setMore((m) => !m)} className="min-h-9 text-sm text-ivory/60 underline-offset-4 hover:underline">
          {more ? he.post.less : he.post.more}
        </button>
      )}
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
      {unit && <span className="font-display text-xl font-bold"><Ltr>{unit}</Ltr></span>}
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
    toast(he.cart.added, { tone: "success" });
  };
  return (
    <Button size="md" variant={inCart ? "dark" : "primary"} disabled={disabled || (direct && inCart)} onClick={add} className="shrink-0">
      {inCart ? he.post.inCart : he.post.addToCart}
    </Button>
  );
}

function AddSheet({ cut, onDone }: { cut: Cut; onDone: () => void }) {
  const toast = useToast();
  const line = useCart().find((l) => l.cutId === cut.id);
  const onOrder = (mode: OrderMode, qty: number | null, total: number) => {
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode, qty, estAgorot: total });
    toast(line ? he.cart.updated : he.cart.added, { tone: "success" });
    onDone();
  };
  return <PurchaseBar cut={cut} inline onOrder={onOrder} inCart={!!line} initialMode={line?.mode} initialQty={line?.qty} />;
}

function SoldStamp() {
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35">
      <span className="-rotate-12">
        <span className="animate-busted block border-2 border-[#e8a0a8] px-5 py-1.5 font-display text-3xl font-bold tracking-widest text-[#e8a0a8]">
          {he.post.soldStamp}
        </span>
      </span>
    </div>
  );
}
