"use client";
// Shop page (customer spec §7, design: Shop): the shop's own head — mark, name, open now and until when, how it
// hands orders over, the week's hours, where the meat comes from, address and phone — showing only what the shop
// filled in; then today's cuts as the same social posts as the feed (design: V3), live.
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { IconBack } from "@/components/icons";
import { CutPost } from "@/components/CutPost";
import { ShopMark } from "@/components/ShopMark";
import { Rise } from "@/components/motion/Rise";
import { RetroBanner } from "@/components/motion/RetroBanner";
import { useCatalog } from "@/components/customer/useCatalog";
import { useHeldItems } from "@/components/customer/useHeldItems";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { isReserved } from "@/lib/feed";
import { onePerParent } from "@/lib/items";
import { EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { closesAt, isOpenNow, isolateTimes, weekRows } from "@/lib/hours";
import { useScrollMemory } from "@/lib/scroll";
import { track } from "@/lib/track";
import { cameFrom } from "@/components/customer/Tracker";
import type { Butcher } from "@/lib/types";

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
  const held = useHeldItems(items.filter((i) => !i.gone).map((i) => i.cut.id));

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const backBtn = (
    <button type="button" onClick={back} aria-label={he.app.back} className="grid size-11 place-items-center rounded-full bg-scrim text-ivory">
      <IconBack />
    </button>
  );

  if (butchers.length > 0 && !shop) {
    return <div className="flex flex-col items-center pt-20"><ErrorState dark text={he.market.shopNotFound} />{backBtn}</div>;
  }
  const live = new Set(items.filter((i) => !i.gone).map((i) => i.cut.parent_id)).size;

  return (
    <main className="relative min-h-dvh pb-28 text-start">
      {shop?.cover_path
        ? <div className="relative px-3 pt-3">{backBtn}</div>
        : <RetroBanner><div className="absolute top-3 right-3 lg:right-8">{backBtn}</div></RetroBanner>}
      {!shop ? <div className="px-4 pt-4"><Skeleton className="h-40" /></div> : <ShopHead shop={shop} now={now} />}

      <section className="relative mx-auto flex w-full max-w-[660px] flex-col gap-3.5 px-3 pt-7 lg:px-0">
        <div className="flex items-baseline justify-between px-1 lg:px-0">
          <h2 className="sr-cutname !text-[20px]">{he.shop.todayCuts}</h2>
          {ready && <span className="text-[13px] text-stone">{he.search.results(live)}</span>}
        </div>
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !ready ? <div className="flex flex-col gap-5">{[0, 1].map((i) => <Skeleton key={i} className="h-[560px] rounded-[22px]" />)}</div>
          : items.length === 0 && pending === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <>
              {pending > 0 && (
                <button type="button" onClick={showNew} className="sr-newpill self-center">{he.feed.newPosts(pending)}</button>
              )}
              <ul className="m-0 flex list-none flex-col gap-5 p-0">
                {onePerParent(items).map(({ cut, gone, trays }, i) => (
                  <li key={cut.id}>
                    <CutPost cut={cut} breeds={breeds} shop={shop} now={now} gone={gone} source="butcher"
                      reserved={!gone && isReserved(cut, held.get(cut.id))} held={held.get(cut.id)} eager={i === 0} trays={trays} />
                  </li>
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
      <section className="relative flex -mt-11 flex-col items-center gap-3 px-4 text-center">
        <ShopMark shop={shop} className="!size-[88px] !text-[38px]" />
        <Rise lines={[shop.name]} className="m-0 font-display text-[32px] font-black leading-[38px]" />
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
