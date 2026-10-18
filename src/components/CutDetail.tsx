"use client";
// The cut page body — shared by the customer cut page (C4) and the butcher preview (B3 step 5):
// the post itself in full (customer spec §6), then the meat certificate and pickup details.
import { CutPost } from "./CutPost";
import { Ltr } from "./ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { breedLabel } from "@/lib/cut-helpers";
import { demoCredits, isDemoMedia } from "@/lib/demo-credits";
import { useNow } from "@/lib/hooks";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia } from "@/lib/types";

export function CutDetail({ cut, media, breeds, butcher }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; butcher?: Butcher | null;
}) {
  const now = useNow(60000);
  const hasSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const demo = isDemoMedia(media);
  const credits = demoCredits(media);

  const rows: [string, React.ReactNode][] = [];
  if (cut.origin_country) rows.push([he.cut.origin, originLabel(cut.origin_country)]);
  const breed = breedLabel(cut, breeds);
  if (breed) rows.push([he.cut.breed, breed]);
  if (cut.is_aged != null) {
    rows.push([he.cut.aging, cut.is_aged && cut.aging_days
      ? <>{he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method))}</>
      : he.feed.notAged]);
  }
  if (cut.weight_g) rows.push([he.cut.weight, <Ltr key="w">{formatWeight(cut.weight_g)}</Ltr>]);
  if (cut.price_per_kg_agorot) rows.push([he.cut.pricePerKg, <Ltr key="p">₪{formatAgorot(cut.price_per_kg_agorot)}</Ltr>]);
  if (hasSteaks && cut.steak_weight_g) rows.push([he.cut.steakWeight, <Ltr key="s">{he.units.approxG(cut.steak_weight_g)}</Ltr>]);
  if (hasSteaks && cut.steak_thickness_cm) rows.push([he.cut.steakThickness, he.cut.thicknessCm(Number(cut.steak_thickness_cm))]);
  if (cut.butcher_marbling) {
    rows.push([he.cut.butcherScore, (
      <span key="m" className="flex flex-col">
        <span><Ltr className="font-semibold">{cut.butcher_marbling}/10</Ltr></span>
        <span className="text-xs text-stone">{he.cut.butcherScoreNote}</span>
      </span>
    )]);
  }

  return (
    <article className="bg-ink text-center text-ivory">
      <div className="px-4 pt-[max(4rem,calc(env(safe-area-inset-top)+3.5rem))]">
        <CutPost cut={cut} media={media} breeds={breeds} shop={butcher} now={now} variant="full" eager />
      </div>
      <div className="flex flex-col gap-7 px-5 pt-5 pb-8">
        <p className="text-xs text-stone/80">{demo ? he.cut.demoPhoto : he.cut.realPhoto}  ·  <Ltr className="tracking-wider">{cut.code}</Ltr></p>

        {rows.length > 0 && (
          <section aria-label={he.cut.details}>
            <h2 className="eyebrow mb-3">{he.cut.details}</h2>
            <dl className="grid grid-cols-2 border-t border-ivory/10">
              {rows.map(([k, v]) => (
                <div key={k} className="flex flex-col items-center gap-0.5 border-b border-ivory/10 px-2 py-3.5 text-[15px]">
                  <dt className="text-xs text-stone">{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {butcher && (
          <section>
            <h2 className="eyebrow mb-3">{he.market.pickupAt(butcher.name)}</h2>
            <p className="text-[15px] leading-relaxed">{butcher.address}{butcher.pickup_hours ? `  ·  ${butcher.pickup_hours}` : ""}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}
              target="_blank" rel="noreferrer"
              className="mt-2 inline-block min-h-10 py-2 text-sm text-gold underline-offset-4 hover:underline">
              {he.market.navigate}
            </a>
          </section>
        )}

        {credits.length > 0 && (
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
        )}
      </div>
    </article>
  );
}
