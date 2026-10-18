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
import { AddChooser } from "./PurchaseBar";
import { BottomSheet, Ltr } from "./ui";
import { IconAging, IconCheck, IconClock, IconClose, IconPlus } from "./icons";
import { useToast } from "./Toast";
import { he } from "@/lib/i18n/he";
import { cart, useCart } from "@/lib/cart";
import { canBuySteaks, canBuyWhole, cutTitle, timeAgo } from "@/lib/cut-helpers";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { formatWeight, money, steakPrice, wholePrice } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia, OrderMode } from "@/lib/types";

export function CutPost({ cut, media, breeds, shop, now, variant = "feed", source = "feed", gone, reserved, eager, children }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; shop?: Pick<Butcher, "name" | "slug" | "logo_path"> | null; now: number;
  variant?: "feed" | "full";
  /** the full post only: what follows the post on its page (the certificate, the purchase bar) */
  children?: React.ReactNode;
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

  const [kind, breed] = splitTitle(title);
  const state = soldOut ? "sold" : reserved ? "reserved" : null;
  const overlay = soldOut ? <SoldStamp code={cut.code} at={cut.sold_out_at} /> : reserved ? <ReservedBadge /> : null;

  return (
    <article ref={ref} className={clsx("text-start", full
      ? "flex flex-col lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:pt-16"
      : "sr-post")}>
      {/* the full post opens on its media, edge to edge (design: Cut); the feed card is a magazine page, text first.
          On a wide screen the media stays on one side while the details and buying scroll beside it */}
      {full && (
        <div className="lg:sticky lg:top-20 lg:overflow-hidden lg:rounded-3xl">
          <PostMedia media={media} title={title} code={cut.code} eager={eager} state={state}>{overlay}</PostMedia>
        </div>
      )}

      <div className={clsx("flex flex-col gap-3", full && "px-4 pt-5 lg:px-0 lg:pt-0")}>
        <header className="sr-post__head">
          {shop && <Link href={shopPath(shop)} aria-label={shop.name}><ShopMark shop={shop} /></Link>}
          <div className="min-w-0">
            {shop && <Link href={shopPath(shop)} className="sr-post__shop block truncate">{shop.name}</Link>}
            <div className={clsx("sr-post__when", soldOut && "sr-post__when--sold", !soldOut && reserved && "sr-post__when--reserved")}>
              {soldOut ? he.post.soldStamp : reserved ? he.post.reserved : cut.published_at ? timeAgo(cut.published_at, now) : null}
            </div>
          </div>
        </header>

        {full
          ? <h1 className="m-0 font-display text-[30px] font-bold leading-9">{kind}{breed && <span className="font-medium text-stone"> · {breed}</span>}</h1>
          : <h2 className="sr-cutname"><Link href={href}>{kind}{breed && <small> · {breed}</small>}</Link></h2>}

        {(aged || facts.length > 0 || partlySold) && (
          <div className="sr-chips">
            {aged && <span className="sr-chip sr-chip--aging"><IconAging className="size-3.5" />{aged}</span>}
            {facts.map((f) => <span key={f} className="sr-chip">{f}</span>)}
            {partlySold && (
              <span key={cut.steaks_available} className="sr-chip sr-chip--left animate-fade-in">{he.post.left(cut.steaks_available, cut.steaks_total)}</span>
            )}
          </div>
        )}
        {cut.description && <Note text={cut.description} full={full} />}
        {cut.butcher_marbling ? <Marbling n={cut.butcher_marbling} full={full} /> : null}
        {!full && <Link href={href} className="sr-link">{he.post.certificate}</Link>}

        {!full && <PostCollage media={media} title={title} code={cut.code} href={href} eager={eager} state={state}>{overlay}</PostCollage>}

        {/* order bar (the full post has the sticky purchase bar instead) */}
        {!full && (
          <div className="sr-orderbar">
            <div className="sr-orderbar__info">
              <Price cut={cut} muted={soldOut} />
              <span className="sr-meta">
                {cut.price_per_kg_agorot ? <><Ltr>{money(cut.price_per_kg_agorot)}</Ltr> {he.feed.perKg} · </> : null}
                <span className="code">{cut.code}</span>
              </span>
              {shop && <span className="sr-meta">{he.post.orderFrom(shop.name)}</span>}
            </div>
            <AddButton cut={cut} soldOut={soldOut} reserved={!!reserved} onChoose={() => setOpen(true)} />
          </div>
        )}
        {full && children}
      </div>

      {!full && open && (
        <BottomSheet open dark title={he.post.chooseTitle} onClose={() => setOpen(false)}>
          <AddSheet cut={cut} onDone={() => setOpen(false)} />
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

/** "מילה מהקצב" (design system: ButcherNote): a gold rule and a gold head, the butcher's words, three lines then "עוד". */
function Note({ text, full }: { text: string; full: boolean }) {
  const [more, setMore] = useState(false);
  const long = text.length > 140 || text.split("\n").length > 3;
  return (
    <div className="sr-note">
      <span className="sr-eyebrow">{he.post.fromButcher}</span>
      <p className={clsx("whitespace-pre-line", (full || more) && "[display:block!important]")}>{text}</p>
      {!full && long && (
        <button type="button" onClick={() => setMore((m) => !m)} className="sr-note__more min-h-8">
          {more ? he.post.less : he.post.more}
        </button>
      )}
    </div>
  );
}

/** The butcher's marbling estimate (design system: MarblingScale): ten marks, always called "הערכת הקצב". */
function Marbling({ n, full }: { n: number; full: boolean }) {
  return (
    <div className="sr-marbling" role="img" aria-label={he.post.marbling(n)}>
      <span className="sr-marbling__bar" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? "on" : undefined} />)}
      </span>
      <span className="sr-marbling__label">{he.post.marblingWord} <b className="ltr">{n}/10</b> · {full ? he.post.marblingFull : he.post.marblingBy}</span>
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

/** The round add button: a whole cut sold only whole goes straight in; a choice opens the sheet. Disabled says why. */
function AddButton({ cut, soldOut, reserved, onChoose }: { cut: Cut; soldOut: boolean; reserved: boolean; onChoose: () => void }) {
  const toast = useToast();
  const inCart = useCart().some((l) => l.cutId === cut.id);
  const direct = cut.sale_mode === "whole";
  if (soldOut || reserved) {
    return (
      <button type="button" disabled className="sr-btn sr-btn--round" aria-label={soldOut ? he.post.soldStamp : he.post.reservedByOther}>
        {soldOut ? <IconClose className="size-6" /> : <IconClock className="size-6" />}
      </button>
    );
  }
  if (direct && inCart) {
    return <button type="button" disabled className="sr-btn sr-btn--round sr-btn--quiet" aria-label={he.post.inCart}><IconCheck className="size-6 text-gold" /></button>;
  }
  const add = () => {
    if (!direct) return onChoose();
    if (!cut.weight_g || !cut.price_per_kg_agorot) return;
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode: "whole", qty: null,
      estAgorot: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    track("add_to_cart", { cut_id: cut.id, mode: "whole", source: "feed", price: wholePrice(cut.weight_g, cut.price_per_kg_agorot) });
    toast(he.cart.added, { tone: "success" });
  };
  return (
    <button type="button" onClick={add} className={clsx("sr-btn sr-btn--round", inCart && "sr-btn--quiet")} aria-label={inCart ? he.post.inCart : he.post.addToCart}>
      {inCart ? <IconCheck className="size-6 text-gold" /> : <IconPlus className="size-6" />}
    </button>
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
