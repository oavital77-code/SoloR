"use client";
// The cut page body — shared by the customer cut page (C4) and the butcher preview (B3 step 5).
import Link from "next/link";
import { MediaGallery } from "./MediaGallery";
import { Ltr } from "./ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originLabel } from "@/lib/labels";
import { breedLabel, cutTitle } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import { shopPath } from "@/lib/market";
import type { Breed, Butcher, Cut, CutMedia } from "@/lib/types";

export function CutDetail({ cut, media, breeds, butcher }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; butcher?: Butcher | null;
}) {
  const title = cutTitle(cut, breeds) || he.butcher.untitled;
  const hasSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";

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

  // the facts a buyer scans first, in one quiet line; the full table stays below
  const facts: string[] = [];
  if (cut.origin_country) facts.push(originLabel(cut.origin_country));
  if (cut.is_aged && cut.aging_days) facts.push(he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method)));
  if (cut.weight_g) facts.push(formatWeight(cut.weight_g));
  if (hasSteaks && cut.steak_weight_g) facts.push(he.cut.steakChip(cut.steak_weight_g));
  if (cut.butcher_marbling) facts.push(he.feed.butcherScore(cut.butcher_marbling));

  return (
    <article className="bg-ink text-center text-ivory">
      <MediaGallery media={media} title={title} code={cut.code} />
      <div className="flex flex-col gap-7 px-5 pt-3 pb-8">
        <header>
          {butcher && (
            <Link href={shopPath(butcher)} className="eyebrow inline-block min-h-6">{butcher.name}</Link>
          )}
          <h1 className="mt-2 font-display text-[34px] font-bold leading-[1.1]">{title}</h1>
          <div className="mt-3 flex flex-col items-center gap-1">
            {cut.price_per_kg_agorot ? (
              <span className="font-display text-2xl font-bold">
                <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr>
                <span className="ms-1.5 font-sans text-sm font-normal text-stone">{he.feed.perKg}</span>
              </span>
            ) : null}
            <span className="text-xs text-stone/80">{he.cut.realPhoto}  ·  <Ltr className="tracking-wider">{cut.code}</Ltr></span>
          </div>
          {facts.length > 0 && (
            <p className="mt-4 border-t border-ivory/10 pt-4 text-[15px] leading-relaxed text-stone" aria-label={he.market.facts}>
              {facts.join("  ·  ")}
            </p>
          )}
        </header>

        {cut.description && (
          <p className="whitespace-pre-line font-display text-[17px] leading-relaxed text-ivory/85">{cut.description}</p>
        )}

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
      </div>
    </article>
  );
}
