"use client";
// Shop page (customer spec §7): the shop's own head — cover, logo, name, what it is about, where and when (with
// "open now"), how orders are received, suppliers and sources, phone — showing only what the shop filled in;
// then only this shop's posts, live, with the same post component and rules as the feed.
import { use } from "react";
import { useRouter } from "next/navigation";
import { CutPost } from "@/components/CutPost";
import { useCatalog } from "@/components/customer/useCatalog";
import { useLiveFeed } from "@/components/customer/useLiveFeed";
import { EmptyState, ErrorState, Ltr, Skeleton } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { mediaUrl } from "@/lib/cut-helpers";
import { useBreeds, useButchers, useNow } from "@/lib/hooks";
import { formatWeek, isOpenNow } from "@/lib/hours";
import { useScrollMemory } from "@/lib/scroll";
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

  const back = () => (window.history.length > 1 ? router.back() : router.push("/"));
  const backLink = (
    <button type="button" onClick={back} className="inline-flex min-h-11 items-center text-sm font-medium text-ivory/70 underline-offset-4 hover:underline">
      {he.app.back}
    </button>
  );

  if (butchers.length > 0 && !shop) {
    return <div className="pt-20"><ErrorState dark text={he.market.shopNotFound} /><div className="text-center">{backLink}</div></div>;
  }

  return (
    <main className="min-h-dvh pb-28">
      {!shop ? <div className="px-5 pt-4"><Skeleton className="h-40" /></div> : <ShopHead shop={shop} now={now} backLink={backLink} />}

      <section className="mt-6">
        {error && !cuts ? <ErrorState dark onRetry={reload} />
          : !ready ? <div className="px-4"><Skeleton className="aspect-[4/5]" /></div>
          : items.length === 0 && pending === 0 ? <EmptyState text={he.market.shopEmpty} />
          : (
            <>
              {pending > 0 && (
                <div className="mb-4 text-center">
                  <button type="button" onClick={showNew} className="rounded-full bg-ivory px-4 py-2 text-sm font-semibold text-ink">
                    {he.feed.newPosts(pending)}
                  </button>
                </div>
              )}
              <ul className="flex flex-col divide-y-[10px] divide-black border-t-[10px] border-black">
                {items.map(({ cut, gone }, i) => (
                  <li key={cut.id} className="pt-4"><CutPost cut={cut} media={cut.cut_media} breeds={breeds} shop={shop} now={now} gone={gone} eager={i === 0} /></li>
                ))}
              </ul>
            </>
          )}
      </section>
    </main>
  );
}

function ShopHead({ shop, now, backLink }: { shop: Butcher; now: number; backLink: React.ReactNode }) {
  const open = isOpenNow(shop.opening_hours, new Date(now));
  const week = formatWeek(shop.opening_hours) || shop.pickup_hours;
  const receive = [shop.pickup_enabled && he.shop.pickup, shop.delivery_enabled && he.shop.delivery].filter(Boolean) as string[];
  const place = [shop.address, shop.city].filter(Boolean).join(", ");

  const rows: [string, React.ReactNode][] = [];
  if (week) rows.push([he.shop.hours, week]);
  if (receive.length) rows.push([he.shop.receive, receive.join("  ·  ")]);
  if (shop.delivery_enabled && shop.delivery_areas?.length) rows.push([he.shop.deliveryAreas, shop.delivery_areas.join(", ")]);
  if (shop.suppliers?.length) rows.push([he.shop.suppliers, shop.suppliers.join(", ")]);
  if (shop.sources?.length) rows.push([he.shop.sources, shop.sources.join(", ")]);

  return (
    <header>
      {shop.cover_path && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(shop.cover_path)} alt="" className="aspect-[16/9] w-full object-cover" />
      )}
      <div className="px-5 pt-2">
        {backLink}
        <div className={shop.cover_path ? "-mt-12" : "mt-2"}>
          {shop.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(shop.logo_path)} alt="" className="mx-auto size-20 rounded-full object-cover ring-2 ring-ink" />
          ) : (
            <span aria-hidden className="mx-auto grid size-20 place-items-center rounded-full bg-ink-3 font-display text-3xl font-bold text-gold ring-1 ring-ivory/15">
              {shop.name.trim().charAt(0)}
            </span>
          )}
        </div>
        <h1 className="mt-3 font-display text-[34px] font-bold leading-[1.05] text-ivory">{shop.name}</h1>
        {shop.specialty && <p className="eyebrow mt-2">{shop.specialty}</p>}
        {shop.description && <p className="mt-3 font-display text-[17px] leading-relaxed text-ivory/80">{shop.description}</p>}

        {place && <p className="mt-4 text-[15px] text-ivory/85">{place}</p>}
        {open !== null && (
          <p className={open ? "mt-1 text-sm font-semibold text-emerald-300" : "mt-1 text-sm font-semibold text-[#e8a0a8]"}>
            {open ? he.shop.openNow : he.shop.closed}
          </p>
        )}
        <div className="mt-1 flex justify-center gap-6 text-sm">
          {place && (
            <a className="min-h-10 py-2.5 text-gold underline-offset-4 hover:underline" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}>{he.market.navigate}</a>
          )}
          <a href={`tel:${shop.phone.replace(/-/g, "")}`} className="min-h-10 py-2.5 text-gold" aria-label={he.shop.phone}><Ltr>{shop.phone}</Ltr></a>
        </div>

        {rows.length > 0 && (
          <dl className="mt-4 border-t border-ivory/10">
            {rows.map(([k, v]) => (
              <div key={k} className="flex flex-col items-center gap-0.5 border-b border-ivory/10 py-3 text-[15px]">
                <dt className="text-xs text-stone">{k}</dt>
                <dd className="text-ivory/90">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </header>
  );
}
