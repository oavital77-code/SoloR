"use client";
// The parent cut's page (BUTCHER_FLOW §6): one page per cut taken out of the counter. The cutting video and the
// photos, the details entered once by the butcher, then what can be bought of it: the ready units, each at its
// own weight and price, and the remainder by weight — all of it, or "פרוס לי". Sold items stay, grey, without a
// button. Opened from a post it scrolls to that item (#i-523-1). Old links (/cut/SOL-0012, /cut/SOL-523-1) work.
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { PostMedia } from "@/components/PostMedia";
import { ShopMark } from "@/components/ShopMark";
import { RemainderChooser } from "@/components/ItemBuy";
import { useAddToCart } from "@/components/CutPost";
import { useHeldItems } from "@/components/customer/useHeldItems";
import { ErrorState, Ltr, Spinner } from "@/components/ui";
import { IconAging, IconBack, IconCheck } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { useCart } from "@/lib/cart";
import { readSolorLabel } from "@/lib/barcode";
import { breedLabel, coverOf, cutTitle, formatDateTime, mediaUrl, timeAgo } from "@/lib/cut-helpers";
import { demoCredits, isDemoMedia } from "@/lib/demo-credits";
import { isolateTimes } from "@/lib/hours";
import { canBuyUnit, displayCode, isAvailable, isReserved, linePrice, toSaleItems, type ItemRow } from "@/lib/items";
import { agingMethodLabel, cutTypeLabel, originLabel } from "@/lib/labels";
import { shopPath } from "@/lib/market";
import { useBreeds, useButchers, useNow, useRefetchOnFocus } from "@/lib/hooks";
import { formatWeight, money } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Parent, SaleItem } from "@/lib/types";

const overlayBtn = "pointer-events-auto grid size-11 place-items-center rounded-full bg-scrim text-ivory";

/** "523", "SOL-523", "SOL-523-1" → the parent code and, maybe, the item to scroll to */
function parseCode(raw: string): { parent: number; label: string | null } | null {
  const s = decodeURIComponent(raw);
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
  const [parent, setParent] = useState<Parent | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    if (!parsed) return setState("notfound");
    const sb = supabaseBrowser();
    const { data: p, error } = await sb.from("parents").select("*").eq("code", parsed.parent).maybeSingle();
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
    const want = window.location.hash.replace(/^#i-/, "") || parsed?.label;
    scrolled.current = true;
    if (!want) return;
    const el = document.getElementById(`i-${want}`);
    if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); setFocus(want); }
  }, [state, parsed?.label]);

  const held = useHeldItems(useMemo(() => items.map((i) => i.id), [items]));
  const butcher = butchers.find((b) => b.id === parent?.butcher_id) ?? null;
  const units = items.filter((i) => i.kind === "unit" && i.status !== "withdrawn").sort((a, b) => (a.unit_no ?? 0) - (b.unit_no ?? 0));
  const remainder = items.find((i) => i.kind === "remainder" && i.status !== "withdrawn") ?? null;
  const title = parent ? cutTitle(parent, breeds) || he.butcher.untitled : "";
  const media = useMemo(() => pageMedia(parent, items), [parent, items]);
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
              const url = `${window.location.origin}/cut/${parent.code}`;
              try {
                if (navigator.share) await navigator.share({ title, url });
                else { await navigator.clipboard.writeText(url); toast(he.cut.linkCopied, { tone: "success" }); }
              } catch { /* user cancelled */ }
            }}
            className="code pointer-events-auto self-center rounded-full bg-scrim px-2.5 py-1.5 text-ivory">
            {displayCode(String(parent.code))}
          </button>
        )}
      </div>

      {state === "loading" && <div className="grid min-h-dvh place-items-center"><Spinner /></div>}
      {state === "error" && <div className="pt-20"><ErrorState dark onRetry={load} /></div>}
      {(state === "notfound" || (state === "ok" && items.length === 0)) && (
        <div className="pt-20"><ErrorState dark text={he.cut.notFound} /></div>
      )}

      {state === "ok" && parent && items.length > 0 && (
        <article className="flex flex-col text-start lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-8 lg:pt-16">
          <div className="lg:sticky lg:top-20 lg:overflow-hidden lg:rounded-3xl">
            <PostMedia media={media} title={title} code={displayCode(String(parent.code))} eager videoFirst state={allGone ? "sold" : null} />
          </div>

          <div className="flex flex-col gap-4 px-4 pt-5 lg:px-0 lg:pt-0">
            <header className="sr-post__head">
              {butcher && <a href={shopPath(butcher)} aria-label={butcher.name}><ShopMark shop={butcher} /></a>}
              <div className="min-w-0">
                {butcher && <a href={shopPath(butcher)} className="sr-post__shop block truncate">{butcher.name}</a>}
                <div className="sr-post__when">{timeAgo(firstPublished(items), now)} · {he.item.fromParent(displayCode(String(parent.code)))}</div>
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

            {units.length > 0 && (
              <section className="flex flex-col gap-2.5" aria-label={he.item.readyUnits}>
                <h2 className="sr-eyebrow m-0 mt-2">{he.item.readyUnits}</h2>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {units.map((u) => <UnitRow key={u.id} item={u} reserved={isReserved(u, held.get(u.id))} focus={focus === u.label} />)}
                </ul>
              </section>
            )}

            {remainder && (
              <RemainderSection item={remainder} held={held.get(remainder.id)} focus={focus === remainder.label} />
            )}

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

/** The cutting video first (R12: shown on the parent's own page), then the cover of every item. */
function pageMedia(parent: Parent | null, items: SaleItem[]): CutMedia[] {
  const out: CutMedia[] = [];
  const video = items.flatMap((i) => i.cut_media).find((m) => m.type === "video");
  if (video) out.push(video);
  const seen = new Set<string>();
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
function UnitRow({ item, reserved, focus }: { item: SaleItem; reserved: boolean; focus: boolean }) {
  const inCart = useCart().some((l) => l.itemId === item.id);
  const add = useAddToCart("post");
  const cover = coverOf(item.cut_media);
  const sold = !isAvailable(item);
  const price = linePrice(item, "unit");
  return (
    <li id={`i-${item.label}`} className={clsx("flex scroll-mt-24 items-center gap-3 rounded-2xl bg-ink-2 p-2 pe-3 transition-shadow",
      sold && "opacity-55 grayscale", focus && "ring-2 ring-brand")}>
      <span className="block size-[72px] shrink-0 overflow-hidden rounded-xl bg-ink-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={item.code} loading="lazy" className="h-full w-full object-cover" />}
      </span>
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

/** The remainder (or the whole cut when it was not split): its photo and balance, all of it or a slice. */
function RemainderSection({ item, held, focus }: { item: SaleItem; held?: import("@/lib/items").Held; focus: boolean }) {
  const line = useCart().find((l) => l.itemId === item.id);
  const add = useAddToCart("post");
  const cover = coverOf(item.cut_media);
  const sold = !isAvailable(item);
  return (
    <section id={`i-${item.label}`} aria-label={item.split ? he.item.fromRemainder : he.item.wholeByWeight}
      className={clsx("flex scroll-mt-24 flex-col gap-3 rounded-2xl bg-ink-2 p-3", sold && "opacity-55 grayscale", focus && "ring-2 ring-brand")}>
      <div className="flex items-center gap-3">
        <span className="block size-[72px] shrink-0 overflow-hidden rounded-xl bg-ink-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={item.code} loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 text-[15px] leading-5">
          <span className="block font-bold">{item.split ? he.item.fromRemainder : he.item.wholeByWeight} <span className="code !text-[14px] text-stone">{item.label}</span></span>
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
    </section>
  );
}

function Certificate({ parent, items, breeds }: { parent: Parent; items: SaleItem[]; breeds: import("@/lib/types").Breed[] }) {
  const rows: [string, React.ReactNode][] = [];
  rows.push([he.cut.code, <span key="c" className="code text-[14px] text-ivory">{displayCode(String(parent.code))}</span>]);
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
