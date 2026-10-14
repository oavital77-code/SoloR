"use client";
// The cut page body — shared by the customer cut page (C4) and the butcher preview (B3 step 5).
import Link from "next/link";
import { ChevronLeft, MapPin } from "lucide-react";
import { MediaGallery } from "./MediaGallery";
import { Ltr } from "./ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, originFlag, originLabel } from "@/lib/labels";
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
  if (hasSteaks && cut.steak_weight_g) rows.push([he.cut.steakWeight, <Ltr key="s">{he.units.approxG(cut.steak_weight_g)}</Ltr>]);
  if (hasSteaks && cut.steak_thickness_cm) rows.push([he.cut.steakThickness, he.cut.thicknessCm(Number(cut.steak_thickness_cm))]);
  if (cut.butcher_marbling) {
    rows.push([he.cut.butcherScore, (
      <span key="m" className="flex flex-col">
        <span><Ltr className="font-extrabold">{cut.butcher_marbling}/10</Ltr></span>
        <span className="text-xs text-white/50">{he.cut.butcherScoreNote}</span>
      </span>
    )]);
  }

  // the facts a buyer scans first, as chips; the full table stays below
  const facts: string[] = [];
  if (cut.origin_country) facts.push(`${originFlag(cut.origin_country)} ${originLabel(cut.origin_country)}`);
  if (cut.is_aged && cut.aging_days) facts.push(`⏳ ${he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method))}`);
  if (cut.weight_g) facts.push(`⚖️ ${formatWeight(cut.weight_g)}`);
  if (hasSteaks && cut.steak_weight_g) facts.push(`🥩 ${he.cut.steakChip(cut.steak_weight_g)}`);
  if (cut.butcher_marbling) facts.push(`★ ${he.feed.butcherScore(cut.butcher_marbling)}`);

  return (
    <article className="bg-ink text-white">
      <div className="relative">
        <MediaGallery media={media} title={title} code={cut.code} />
        <span className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold backdrop-blur">
          {he.cut.realPhoto}
        </span>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-4 pb-6">
        <header>
          {butcher && (
            <Link href={shopPath(butcher)} className="mb-2 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-white/70">
              <span className="grid size-7 place-items-center rounded-lg bg-brand text-xs font-extrabold text-white">{butcher.name.trim().charAt(0)}</span>
              {butcher.name}<ChevronLeft className="size-4" aria-hidden />
            </Link>
          )}
          <h1 className="text-[28px] font-extrabold leading-tight">{title}</h1>
          <div className="mt-1 flex items-baseline gap-3">
            {cut.price_per_kg_agorot && (
              <span className="text-xl font-extrabold"><Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr> <span className="text-sm font-semibold text-white/60">{he.feed.perKg}</span></span>
            )}
            <Ltr className="text-xs text-white/40">{cut.code}</Ltr>
          </div>
        </header>

        {facts.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label={he.market.facts}>
            {facts.map((f) => <li key={f} className="rounded-full bg-white/[0.08] px-3 py-1.5 text-sm font-semibold ring-1 ring-white/10">{f}</li>)}
          </ul>
        )}

        {cut.description && (
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-white/85">{cut.description}</p>
        )}

        {rows.length > 0 && (
          <section aria-label={he.cut.details}>
            <h2 className="mb-2 text-base font-extrabold text-white/80">{he.cut.details}</h2>
            <dl className="divide-y divide-white/[0.08] rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
              {rows.map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 px-4 py-3 text-[15px]">
                  <dt className="text-white/55">{k}</dt>
                  <dd className="text-end font-semibold">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {butcher && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}
            target="_blank" rel="noreferrer"
            className="flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.04] px-4 py-3 ring-1 ring-white/10"
          >
            <MapPin className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="flex flex-col">
              <span className="text-sm text-white/55">{he.market.pickupAt(butcher.name)}</span>
              <span className="font-semibold">{butcher.address}{butcher.pickup_hours ? ` · ${butcher.pickup_hours}` : ""}</span>
            </span>
          </a>
        )}
      </div>
    </article>
  );
}
