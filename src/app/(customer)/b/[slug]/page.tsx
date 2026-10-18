"use client";
// Shop page (customer spec §7, design: Shop): the shop's own head — mark, name, open now and until when, how it
// hands orders over, the week's hours, where the meat comes from, address and phone — showing only what the shop
// filled in; then today's cuts as a grid of tiles, live (reserved and sold show on the tile).
import { use, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { IconBack } from "@/components/icons";
import { ShopMark } from "@/components/ShopMark";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldCuts } from "@/components/customer/useHeldCuts";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { isReserved } from "@/lib/feed";
import { EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { money, steakPrice, wholePrice } from "@/lib/pricing";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { closesAt, isOpenNow, isolateTimes, weekRows } from "@/lib/hours";
import { useScrollMemory } from "@/lib/scroll";
import { track } from "@/lib/track";
import { cameFrom } from "@/components/customer/Tracker";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export default function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const butchers = useButchers();
  const breeds = useBreeds();
  const now = useNow(60000);
  const shop = butchers.find((b) => b.slug === slug) ?? null;
  const { cuts, error, reload } = useCatalog(shop?.id ?? null, !!shop);
  const { items, pending, showNew, ready } = useLiveFeed(cuts);
  useScrollMemory(`shop:${slug}`, ready);
  useEffect(() => { if (shop) track("butcher_page_view", { butcher_id: shop.id, source: cameFrom() }); }, [shop?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const held = useHeldCuts(items.filter((i) => !i.gone).map((i) => i.cut.id));

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const backBtn = (
    <button type="button" onClick={back} aria-label={he.app.back} className="grid size-11 place-items-center rounded-full bg-scrim text-ivory">
      <IconBack />
    </button>
  );

  if (butchers.length > 0 && !shop) {
    return <div className="flex flex-col items-center pt-20"><ErrorState dark text={he.market.shopNotFound} />{backBtn}</div>;
  }
  const live = items.filter((i) => !i.gone).length;

  return (
    <main className="relative min-h-dvh pb-28 text-start">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] [background:radial-gradient(110%_80%_at_50%_0%,rgb(163_18_42/0.35),transparent_75%)]" aria-hidden />
      <div className="relative px-3 pt-3">{backBtn}</div>
      {!shop ? <div className="px-4 pt-4"><Skeleton className="h-40" /></div> : <ShopHead shop={shop} now={now} />}

      <section className="relative flex flex-col gap-3.5 px-4 pt-7 lg:px-8">
        <div className="flex items-baseline justify-between">
          <h2 className="sr-cutname !text-[20px]">{he.shop.todayCuts}</h2>
          {ready && <span className="text-[13px] text-stone">{he.search.results(live)}</span>}
        </div>
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !ready ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1].map((i) => <Skeleton key={i} className="aspect-square rounded-2xl" />)}</div>
          : items.length === 0 && pending === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <>
              {pending > 0 && (
                <button type="button" onClick={showNew} className="sr-newpill self-center">{he.feed.newPosts(pending)}</button>
              )}
              <ul className="grid grid-cols-2 gap-x-3 gap-y-4 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-8">
                {items.map(({ cut, gone }) => (
                  <ShopTile key={cut.id} cut={cut} breeds={breeds} gone={gone} reserved={!gone && isReserved(cut, held.get(cut.id))} />
                ))}
              </ul>
            </>
          )}
      </section>
    </main>
  );
}

/** The shop's head (design: Shop): its mark, name, open now and until when, how it hands orders over, the week's
 * hours in a card, where its meat comes from, and the address and phone. Only what the shop filled in shows. */
function ShopHead({ shop, now }: { shop: Butcher; now: number }) {
  const open = isOpenNow(shop.opening_hours, new Date(now));
  const until = open ? closesAt(shop.opening_hours, new Date(now)) : null;
  const rows = weekRows(shop.opening_hours);
  const receive = [shop.pickup_enabled && he.shop.pickupLine, shop.delivery_enabled && he.shop.deliveryLine].filter(Boolean) as string[];
  const place = [shop.address, shop.city].filter(Boolean).join(", ");
  const origins = [...(shop.suppliers ?? []), ...(shop.sources ?? [])];

  return (
    <header className="relative">
      {shop.cover_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(shop.cover_path)} alt="" className="mt-3 aspect-[16/9] w-full object-cover" />
      )}
      <section className={clsx("flex flex-col items-center gap-3 px-4 text-center", shop.cover_path ? "-mt-11" : "pt-2")}>
        <ShopMark shop={shop} className="!size-[88px] !text-[38px]" />
        <h1 className="m-0 font-display text-[28px] font-bold leading-[34px]">{shop.name}</h1>
        {open !== null && (
          <div className="flex items-center gap-2 text-sm">
            <span className={clsx("size-2 rounded-full", open ? "bg-success" : "bg-sold")} />
            <span className={clsx("font-semibold", open ? "text-success" : "text-sold")}>{open ? he.shop.openNow : he.shop.closed}</span>
            {until && <span className="text-stone">· {he.shop.until} <Ltr>{until}</Ltr></span>}
          </div>
        )}
        {shop.specialty && <p className="sr-eyebrow m-0">{shop.specialty}</p>}
        {receive.length > 0 && <p className="m-0 max-w-[300px] text-sm leading-5 text-stone">{receive.join(" ")}</p>}
        {shop.description && <p className="m-0 max-w-[340px] font-display text-[17px] leading-relaxed text-ivory/85">{shop.description}</p>}
      </section>

      <section className="flex flex-col gap-4 px-4 pt-6 lg:mx-auto lg:w-full lg:max-w-[760px]">
        {(rows.length > 0 || shop.pickup_hours) && (
          <div className="flex flex-col gap-2.5 rounded-3xl border border-line bg-ink-2 p-4">
            <span className="sr-eyebrow">{he.shop.hoursShort}</span>
            {rows.length > 0 ? rows.map((r) => (
              <div key={r.days} className="sr-rowline">
                <span className={clsx(!r.ranges && "text-stone")}>{r.days}</span>
                {r.ranges ? <Ltr>{r.ranges}</Ltr> : <span className="text-stone">{he.shop.closedDay}</span>}
              </div>
            )) : <p className="m-0 text-[15px]">{isolateTimes(shop.pickup_hours ?? "")}</p>}
          </div>
        )}
        {shop.delivery_enabled && shop.delivery_areas?.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="sr-eyebrow">{he.shop.deliveryAreas}</span>
            <div className="sr-chips">{shop.delivery_areas.map((a) => <span key={a} className="sr-chip">{a}</span>)}</div>
          </div>
        )}
        {origins.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <span className="sr-eyebrow">{he.shop.origins}</span>
            <div className="sr-chips">{origins.map((o) => <span key={o} className="sr-chip">{o}</span>)}</div>
          </div>
        )}
        {(place || shop.phone) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            {place && <span className="text-[15px] text-ivory/85">{place}</span>}
            {place && (
              <a className="sr-link" target="_blank" rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}>{he.market.navigate}</a>
            )}
            <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="min-h-8 text-sm font-semibold text-gold" aria-label={he.shop.phone}><Ltr>{shop.phone}</Ltr></a>
          </div>
        )}
      </section>
    </header>
  );
}

/** One of today's cuts as a square tile: photo, cut, aging and the unit price; reserved and sold say so on it. */
function ShopTile({ cut, breeds, gone, reserved }: { cut: CutWithMedia; breeds: Breed[]; gone: boolean; reserved: boolean }) {
  const cover = coverOf(cut.cut_media);
  const title = cutTitle(cut, breeds);
  const ppk = cut.price_per_kg_agorot;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steak_weight_g;
  const price = ppk ? (steaks ? money(steakPrice(cut.steak_weight_g!, ppk)) : cut.weight_g ? money(wholePrice(cut.weight_g, ppk)) : null) : null;
  return (
    <li>
      <Link href={`/cut/${cut.code}`} className="flex flex-col gap-1.5">
        <span className="relative block aspect-square overflow-hidden rounded-2xl bg-ink-3">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} loading="lazy"
              className={clsx("h-full w-full object-cover", gone && "grayscale brightness-[.55]", reserved && "brightness-[.8]")} />
          )}
          {reserved && <span className="sr-badge-reserved !top-2 !h-[26px] !text-xs" style={{ insetInlineEnd: 8 }}>{he.post.reserved}</span>}
          {gone && <span className="absolute inset-0 grid place-items-center font-display text-2xl font-extrabold text-sold">{he.post.soldStamp}</span>}
        </span>
        <span className="text-[15px] font-semibold leading-5">{title}</span>
        <span className="text-[13px] text-stone">
          {cut.is_aged && cut.aging_days ? <>{he.feed.agedDays(cut.aging_days)} · </> : null}
          {price && <>{steaks ? he.post.from : null}<Ltr>{price}</Ltr></>}
        </span>
      </Link>
    </li>
  );
}
