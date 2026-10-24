"use client";
// The parent cut's page (BUTCHER_FLOW_v2 §5): one page per cut taken out of the counter, addressed by its id (clip
// numbers come back). The cutting video and the cut's photos, the details entered once by the butcher, then what can
// be bought of it (founders' pick of the sketches, 22.10.2026): the block first, as the mother card — all of it, or
// "פרוס לי" — and the trays cut from it hanging off it, each at its own weight and price.
// Sold items stay, grey, without a button. Opened from a post it scrolls to that item (#i-15-09). Old links by
// number (/cut/523, /cut/SOL-523-1) open the latest cut with that number.
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { PostMedia } from "@/components/PostMedia";
import { ShopMark } from "@/components/ShopMark";
import { RemainderChooser } from "@/components/ItemBuy";
import { useAddToCart } from "@/components/CutPost";
import { useHeldItems } from "@/components/customer/useHeldItems";
import { ErrorState, Ltr } from "@/components/ui";
import { IconAging, IconBack, IconCheck } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { readSolorLabel } from "@/lib/barcode";
import { breedLabel, coverOf, cutTitle, formatDateTime, mediaUrl, timeAgo } from "@/lib/cut-helpers";
import { demoCredits, isDemoMedia } from "@/lib/demo-credits";
import { isolateTimes } from "@/lib/hours";
import { canBuyUnit, clipNo, displayCode, isAvailable, isReserved, linePrice, toSaleItems, type ItemRow } from "@/lib/items";
import { agingMethodLabel, cutTypeLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { useBreeds, useButchers, useNow, useRefetchOnFocus } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Parent, SaleItem } from "@/lib/types";
import { PageLoader } from "@/components/motion/Steak";

const overlayBtn = "pointer-events-auto grid size-11 place-items-center rounded-full bg-scrim text-ivory";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** a parent's id; or, from an old link, "523", "SOL-523", "SOL-523-1" → the number and, maybe, the item to scroll to */
function parseCode(raw: string): { id: string } | { parent: number; label: string | null } | null {
  const s = decodeURIComponent(raw);
  if (UUID.test(s)) return { id: s };
  if (/^\d{1,7}$/.test(s)) return { parent: Number(s), label: null };
  const l = readSolorLabel(s);
  return l ? { parent: l.parentCode, label: l.unitNo ? l.label : null } : null;
}

export default function ParentPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const parsed = parseCode(code);
  const breeds = useBreeds();
  const butchers = useButchers();
  const now = useNow(60000);
  const toast = useToast();
  const router = useRouter();
  const [parent, setParent] = useState<(Parent & { cut_media?: CutMedia[] }) | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    if (!parsed) return setState("notfound");
    const sb = supabaseBrowser();
    const q = sb.from("parents").select("*, cut_media(*)");
    const { data: p, error } = await ("id" in parsed ? q.eq("id", parsed.id)
      : q.eq("code", parsed.parent).order("created_at", { ascending: false }).limit(1)).maybeSingle();
    if (error) return setState("error");
    if (!p) return setState("notfound");
    const { data: rows, error: e2 } = await sb.from("items").select("*, cut_media(*)").eq("parent_id", p.id)
      .in("status", ["published", "sold_out", "withdrawn"]);
    if (e2) return setState("error");
    setParent(p as Parent);
    setItems(toSaleItems(((rows ?? []) as ItemRow[]).map((r) => ({ ...r, parent: p as Parent })), "always")
      .filter((i) => i.published_at));
    setState("ok");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  // live stock for this parent's items
  const pid = parent?.id;
  useEffect(() => {
    if (!pid) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`parent-${pid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `parent_id=eq.${pid}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [pid, load]);

  // opened from a post: scroll to that item once it is on the page
  const scrolled = useRef(false);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (state !== "ok" || scrolled.current) return;
    const want = window.location.hash.replace(/^#i-/, "") || (parsed && "label" in parsed ? parsed.label : null);
    scrolled.current = true;
    if (!want) return;
    const el = document.getElementById(`i-${want}`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setFocus(want); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const held = useHeldItems(useMemo(() => items.map((i) => i.id), [items]));
  const butcher = butchers.find((b) => b.id === parent?.butcher_id) ?? null;
  const units = items.filter((i) => i.kind === "unit" && i.status !== "withdrawn").sort((a, b) => (a.unit_no ?? 0) - (b.unit_no ?? 0));
  const remainder = items.find((i) => i.kind === "remainder" && i.status !== "withdrawn") ?? null;
  const title = parent ? cutTitle(parent, breeds) || he.butcher.untitled : "";
  const media = useMemo(() => pageMedia(parent, items), [parent, items]);
  // a tap on a tray's (or the block's) photo shows it in the big frame; on a phone the frame is above: scroll to it
  const hero = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState<{ path: string; n: number } | null>(null);
  const showPhoto = (m: CutMedia | undefined) => {
    if (!m) return;
    setShow((s) => ({ path: m.storage_path, n: (s?.n ?? 0) + 1 }));
    if (window.innerWidth < 1024) hero.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const allGone = items.length > 0 && !items.some(isAvailable);

  return (
    <main className="relative min-h-dvh pb-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))] lg:hidden">
        <button type="button" aria-label={he.app.back}
          onClick={() => (window.history.length > 1 ? router.back() : router.push(butcher ? shopPath(butcher) : "/"))}
          className={overlayBtn}>
          <IconBack />
        </button>
        {parent?.code != null && (
          <button type="button" aria-label={he.cut.share}
            onClick={async () => {
              const url = `${window.location.origin}/cut/${parent.id}`;
              try {
                if (navigator.share) await navigator.share({ title, url });
                else { await navigator.clipboard.writeText(url); toast(he.cut.linkCopied, { tone: "success" }); }
              } catch { /* user cancelled */ }
            }}
            className="code pointer-events-auto self-center rounded-full bg-scrim px-2.5 py-1.5 text-ivory">
            {displayCode(clipNo(parent.code))}
          </button>
        )}
      </div>

      {state === "loading" && <PageLoader />}
      {state === "error" && <div className="pt-20"><ErrorState dark onRetry={load} /></div>}
      {(state === "notfound" || (state === "ok" && items.length === 0)) && (
        <div className="pt-20"><ErrorState dark text={he.cut.notFound} /></div>
      )}

      {state === "ok" && parent && items.length > 0 && (
        <article className="flex flex-col text-start lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:pt-16">
          <div ref={hero} className="lg:sticky lg:top-20 lg:overflow-hidden lg:rounded-3xl">
            <PostMedia media={media} title={title} code={displayCode(clipNo(parent.code))} eager videoFirst state={allGone ? "sold" : null} show={show} />
          </div>

          <div className="flex flex-col gap-4 px-4 pt-5 lg:px-0 lg:pt-0">
            <header className="sr-post__head">
              {butcher && <a href={shopPath(butcher)} aria-label={butcher.name}><ShopMark shop={butcher} /></a>}
              <div className="min-w-0">
                {butcher && <a href={shopPath(butcher)} className="sr-post__shop block truncate">{butcher.name}</a>}
                <div className="sr-post__when">{timeAgo(firstPublished(items), now)} · {he.item.fromParent(displayCode(clipNo(parent.code)))}</div>
              </div>
            </header>

            <h1 className="m-0 font-display text-[30px] font-black leading-9">
              {cutTypeLabel(parent.cut_type)}{breedLabel(parent, breeds) && <span className="font-normal text-stone"> · {breedLabel(parent, breeds)}</span>}
            </h1>
            <Chips parent={parent} />
            {parent.description && (
              <div className="sr-note">
                <span className="sr-eyebrow">{he.post.fromButcher}</span>
                <p className="whitespace-pre-line [display:block!important]">{parent.description}</p>
              </div>
            )}
            {parent.butcher_marbling ? <Marbling n={parent.butcher_marbling} /> : null}

            <section aria-label={he.item.family(clipNo(parent.code))}
              className="mt-2 flex flex-col rounded-2xl border-2 border-ivory bg-ink-2 p-3 lg:border-0 lg:bg-transparent lg:p-0">
              {remainder
                ? <RemainderSection item={remainder} held={held.get(remainder.id)} focus={focus === remainder.label} onShow={showPhoto} />
                : <ParentHead parent={parent} onShow={showPhoto} />}
              {units.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 border-t border-dashed border-stone/40 pt-3 lg:ms-11 lg:mt-2 lg:border-s-2 lg:border-t-0 lg:ps-4 lg:pt-2">
                  <h2 className="sr-eyebrow m-0">{he.item.cutFrom(units.length)}</h2>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {units.map((u) => <UnitRow key={u.id} item={u} reserved={isReserved(u, held.get(u.id))} focus={focus === u.label} onShow={showPhoto} />)}
                  </ul>
                </div>
              )}
            </section>

            <Certificate parent={parent} items={items} breeds={breeds} />

            {butcher && (
              <section className="flex flex-col gap-1.5">
                <div className="h-px bg-line" />
                <h2 className="sr-eyebrow m-0 mt-5">{he.market.pickupAt(butcher.name)}</h2>
                <p className="m-0 text-[15px] leading-relaxed">{butcher.address}{butcher.pickup_hours ? <>  ·  {isolateTimes(butcher.pickup_hours)}</> : ""}</p>
                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}
                  target="_blank" rel="noreferrer" className="sr-link w-fit">
                  {he.market.navigate}
                </a>
              </section>
            )}
            <Credits media={media} />
          </div>
        </article>
      )}
    </main>
  );
}

/** The cutting video first (R12: shown on the parent's own page), the cut's own photos, then the cover of every tray. */
function pageMedia(parent: (Parent & { cut_media?: CutMedia[] }) | null, items: SaleItem[]): CutMedia[] {
  const out: CutMedia[] = [];
  const video = items.flatMap((i) => i.cut_media).find((m) => m.type === "video");
  if (video) out.push(video);
  const seen = new Set<string>();
  for (const m of (parent?.cut_media ?? []).filter((x) => x.type === "photo").sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)) {
    seen.add(m.storage_path);
    out.push({ ...m, is_cover: out.length === (video ? 1 : 0), sort_order: out.length });
  }
  for (const i of items) {
    for (const m of i.cut_media.filter((x) => x.type === "photo").sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)) {
      if (seen.has(m.storage_path)) continue;
      seen.add(m.storage_path);
      out.push({ ...m, is_cover: out.length === (video ? 1 : 0), sort_order: out.length });
      break;
    }
  }
  return parent ? out : [];
}

const firstPublished = (items: SaleItem[]) =>
  items.map((i) => i.published_at!).filter(Boolean).sort()[0] ?? new Date().toISOString();

function Chips({ parent }: { parent: Parent }) {
  const method = agingMethodLabel(parent.aging_method);
  const aged = parent.is_aged && parent.aging_days ? `${he.feed.agedDays(parent.aging_days)}${method ? ` · ${method}` : ""}` : null;
  return (
    <div className="sr-chips">
      {parent.origin_country && <span className="sr-chip">{originLabel(parent.origin_country)}</span>}
      {aged ? <span className="sr-chip sr-chip--aging"><IconAging className="size-3.5" />{aged}</span>
        : parent.is_aged === false ? <span className="sr-chip">{he.feed.notAged}</span> : null}
      {parent.price_per_kg_agorot && <span className="sr-chip"><Ltr>{money(parent.price_per_kg_agorot)}</Ltr>&nbsp;{he.item.perKg}</span>}
    </div>
  );
}

/** "הערכת הקצב" (design system: MarblingScale): ten marks. */
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

/** One ready unit: its photo, label, steaks, weight and price, and [הזמן] — grey once sold (§6). */
function UnitRow({ item, reserved, focus, onShow }: { item: SaleItem; reserved: boolean; focus: boolean; onShow: (m: CutMedia | undefined) => void }) {
  const inCart = useCart().some((l) => l.itemId === item.id);
  const add = useAddToCart("post");
  const cover = coverOf(item.cut_media);
  const sold = !isAvailable(item);
  const price = linePrice(item, "unit");
  return (
    <li id={`i-${item.label}`} className={clsx("flex scroll-mt-24 items-center gap-3 border-s-2 border-stone/40 py-1 ps-3 transition-shadow",
      "lg:rounded-2xl lg:border-s-0 lg:bg-ink-2 lg:p-2 lg:pe-3", sold && "opacity-55 grayscale", focus && "ring-2 ring-brand")}>
      <ThumbButton cover={cover} label={item.code} onShow={onShow} small />
      <span className="min-w-0 flex-1 text-[15px] leading-5">
        <span className="block font-bold"><span className="code !text-[14px]">{item.label}</span>{item.steak_count ? <> · {he.item.steaks(item.steak_count)}</> : null}</span>
        <span className="text-stone"><Ltr>{formatWeight(item.weight_g ?? 0)}</Ltr> · <Ltr className="font-bold text-ivory">{money(price)}</Ltr></span>
      </span>
      {sold ? <span className="font-bold text-sold">{he.item.soldOut}</span>
        : reserved ? <span className="font-bold text-gold">{he.item.reserved}</span>
        : inCart ? <span className="inline-flex items-center gap-1 font-bold text-success"><IconCheck className="size-5" />{he.item.inCart}</span>
        : (
          <button type="button" className="sr-btn !min-h-11 !px-4" disabled={!canBuyUnit(item)}
            onClick={() => add(item, "unit", null, null, price)}>
            {he.item.order}
          </button>
        )}
    </li>
  );
}

/** The block — the mother card (sketches 1 and 5): the cut itself by weight, all of it or a slice. On a computer it is
 * a card of its own; on a phone the family section around it is the card. */
function RemainderSection({ item, held, focus, onShow }: {
  item: SaleItem; held?: import("@/lib/items").Held; focus: boolean; onShow: (m: CutMedia | undefined) => void;
}) {
  const line = useCart().find((l) => l.itemId === item.id);
  const add = useAddToCart("post");
  const cover = coverOf(item.cut_media);
  const sold = !isAvailable(item);
  return (
    <div id={`i-${item.label}`} aria-label={item.split ? he.item.fromRemainder : he.item.wholeByWeight}
      className={clsx("flex scroll-mt-24 flex-col gap-3 rounded-2xl", "lg:border-2 lg:border-ivory lg:bg-ink-2 lg:p-4",
        sold && "opacity-55 grayscale", focus && "ring-2 ring-brand")}>
      <div className="flex items-center gap-3">
        <ThumbButton cover={cover} label={item.code} onShow={onShow} />
        <span className="min-w-0 text-[15px] leading-5">
          <span className="sr-eyebrow block">{he.item.theCut}</span>
          <span className="block text-[17px] font-bold">{he.item.blockLine(item.label, !!item.split)}</span>
          <span className="text-stone">
            {sold ? he.item.soldOut : <><Ltr>{formatWeight(item.weight_g ?? 0)}</Ltr> · <Ltr>{money(item.price_per_kg_agorot ?? 0)}</Ltr> {he.item.perKg}</>}
          </span>
        </span>
      </div>
      {!sold && (
        <RemainderChooser compact item={item} held={held} inCart={!!line} initial={line}
          key={line ? `${line.mode}-${line.grams}` : "new"}
          onOrder={(...a) => add(item, ...a)} />
      )}
    </div>
  );
}

/** No block (all of it went into trays): the cut itself heads its trays — its photo and number, nothing to buy. */
function ParentHead({ parent, onShow }: { parent: Parent & { cut_media?: CutMedia[] }; onShow: (m: CutMedia | undefined) => void }) {
  const code = clipNo(parent.code);
  return (
    <div className="flex items-center gap-3 rounded-2xl lg:border-2 lg:border-ivory lg:bg-ink-2 lg:p-4">
      <ThumbButton cover={coverOf(parent.cut_media ?? [])} label={displayCode(code)} onShow={onShow} />
      <span className="min-w-0 text-[15px] leading-5">
        <span className="sr-eyebrow block">{he.item.theCut}</span>
        <span className="block text-[17px] font-bold">{he.item.allTrays(code)}</span>
        {parent.weight_g ? <span className="text-stone"><Ltr>{formatWeight(parent.weight_g)}</Ltr></span> : null}
      </span>
    </div>
  );
}

/** A tray's (or the block's) photo: a tap shows it in the big frame. */
function ThumbButton({ cover, label, onShow, small }: {
  cover: CutMedia | undefined; label: string; onShow: (m: CutMedia | undefined) => void;
  /** a tray's: smaller on a phone */
  small?: boolean;
}) {
  return (
    <button type="button" onClick={() => onShow(cover)} aria-label={he.cut.showPhoto(label)}
      className={clsx("block shrink-0 overflow-hidden rounded-xl bg-ink-3 transition-transform active:scale-95", small ? "size-14 lg:size-[72px]" : "size-[72px]")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" loading="lazy" className="h-full w-full object-cover" />}
    </button>
  );
}

function Certificate({ parent, items, breeds }: { parent: Parent; items: SaleItem[]; breeds: import("@/lib/types").Breed[] }) {
  const rows: [string, React.ReactNode][] = [];
  rows.push([he.cut.code, <span key="c" className="code text-[14px] text-ivory">{displayCode(clipNo(parent.code))}</span>]);
  if (parent.cut_type) rows.push([he.cut.cutLabel, cutTypeLabel(parent.cut_type)]);
  const breed = breedLabel(parent, breeds);
  if (breed) rows.push([he.cut.breed, breed]);
  if (parent.origin_country) rows.push([he.cut.origin, originLabel(parent.origin_country)]);
  if (parent.is_aged != null) {
    rows.push([he.cut.aging, parent.is_aged && parent.aging_days ? he.cut.aged(parent.aging_days, agingMethodLabel(parent.aging_method)) : he.feed.notAged]);
  }
  rows.push([he.cut.photographed, formatDateTime(firstPublished(items))]);
  return (
    <section className="flex flex-col gap-3" aria-label={he.cut.certificate}>
      <div className="h-px bg-line" />
      <h2 className="sr-eyebrow m-0">{he.cut.certificate}</h2>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-[15px] leading-5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-stone">{k}</dt>
            <dd className="m-0 font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="sr-legal m-0">{he.cut.weightRuleShort}</p>
      <p className="sr-legal m-0">{isDemoMedia(items.flatMap((i) => i.cut_media)) ? he.cut.demoPhoto : he.cut.realPhoto}</p>
    </section>
  );
}

function Credits({ media }: { media: CutMedia[] }) {
  const credits = demoCredits(media);
  if (!credits.length) return null;
  return (
    <p className="text-[11px] leading-relaxed text-stone/70" dir="ltr">
      {he.cut.photoCredits}:{" "}
      {credits.map((c, i) => (
        <span key={c.page}>
          {i > 0 && " · "}
          <a href={c.page} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">{c.author}</a>
          {" "}({c.license}, Wikimedia Commons)
        </span>
      ))}
    </p>
  );
}
