"use client";
// The cut page body — shared by the customer cut page (C4) and the butcher preview (B3 step 5).
import { MapPin } from "lucide-react";
import { MediaGallery } from "./MediaGallery";
import { Ltr } from "./ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originFlag, originLabel } from "@/lib/labels";
import { breedLabel, cutTitle } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia } from "@/lib/types";

export function CutDetail({ cut, media, breeds, butcher }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; butcher?: Butcher | null;
}) {
  const title = cutTitle(cut, breeds) || he.butcher.untitled;
  const hasSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";

  const rows: [string, React.ReactNode][] = [];
  if (cut.origin_country) rows.push([he.cut.origin, `${originFlag(cut.origin_country)} ${originLabel(cut.origin_country)}`]);
  const breed = breedLabel(cut, breeds);
  if (breed) rows.push([he.cut.breed, breed]);
  if (cut.is_aged != null) {
    rows.push([he.cut.aging, cut.is_aged && cut.aging_days
      ? <>{he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method))}</>
      : he.feed.notAged]);
  }
  if (cut.weight_g) rows.push([he.cut.weight, <Ltr key="w">{formatWeight(cut.weight_g)}</Ltr>]);
  if (cut.price_per_kg_agorot) rows.push([he.cut.pricePerKg, <Ltr key="p">₪{formatAgorot(cut.price_per_kg_agorot)}</Ltr>]);
  if (hasSteaks && cut.steak_weight_g) rows.push([he.cut.steakWeight, <Ltr key="s">{`~${cut.steak_weight_g} גר׳`}</Ltr>]);
  if (hasSteaks && cut.steak_thickness_cm) rows.push([he.cut.steakThickness, he.cut.thicknessCm(Number(cut.steak_thickness_cm))]);
  if (cut.butcher_marbling) {
    rows.push([he.cut.butcherScore, (
      <span key="m" className="flex flex-col">
        <span><Ltr className="font-extrabold">{cut.butcher_marbling}/10</Ltr></span>
        <span className="text-xs text-white/50">{he.cut.butcherScoreNote}</span>
      </span>
    )]);
  }

  return (
    <article className="bg-ink text-white">
      <MediaGallery media={media} title={title} code={cut.code} />
      <div className="flex flex-col gap-5 px-5 pt-4 pb-6">
        <p className="text-sm font-semibold text-white/70">{he.cut.realPhoto}</p>
        <header>
          <h1 className="text-3xl font-extrabold leading-tight">{title}</h1>
          <Ltr className="mt-1 text-sm text-white/50">{cut.code}</Ltr>
        </header>

        {butcher && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}
            target="_blank" rel="noreferrer"
            className="flex min-h-11 items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10"
          >
            <MapPin className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="flex flex-col">
              <span className="font-bold">{butcher.name}</span>
              <span className="text-sm text-white/60">{butcher.address} · {he.cut.openMap}</span>
            </span>
          </a>
        )}

        {rows.length > 0 && (
          <section aria-label={he.cut.details}>
            <h2 className="mb-2 text-lg font-extrabold">{he.cut.details}</h2>
            <dl className="divide-y divide-white/10 rounded-2xl bg-white/5 ring-1 ring-white/10">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-4 py-3">
                  <dt className="text-white/60">{k}</dt>
                  <dd className="text-end font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {cut.description && (
          <section>
            <h2 className="mb-2 text-lg font-extrabold">{he.cut.description}</h2>
            <p className="whitespace-pre-line leading-relaxed text-white/85">{cut.description}</p>
          </section>
        )}
      </div>
    </article>
  );
}
