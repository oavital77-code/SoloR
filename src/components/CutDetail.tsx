"use client";
// The cut page body (design: Cut) — shared by the customer cut page (C4) and the butcher preview (B3 step 5):
// the post in full, media first and edge to edge, then the meat certificate fact by fact, and where to pick it up.
import { CutPost } from "./CutPost";
import { Ltr } from "./ui";
import { he } from "@/lib/i18n/he";
import { agingMethodLabel, cutTypeLabel, originLabel } from "@/lib/labels";
import { breedLabel, formatDateTime } from "@/lib/cut-helpers";
import { isolateTimes } from "@/lib/hours";
import { demoCredits, isDemoMedia } from "@/lib/demo-credits";
import { useNow } from "@/lib/hooks";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, Butcher, Cut, CutMedia } from "@/lib/types";

export function CutDetail({ cut, media, breeds, butcher, children }: {
  cut: Cut; media: CutMedia[]; breeds: Breed[]; butcher?: Butcher | null;
  /** what comes after the certificate in the details column (the purchase bar) */
  children?: React.ReactNode;
}) {
  const now = useNow(60000);
  const hasSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const demo = isDemoMedia(media);
  const credits = demoCredits(media);

  // the meat certificate (design: Cut): what this one piece is, fact by fact
  const rows: [string, React.ReactNode][] = [];
  rows.push([he.cut.code, <span key="c" className="code text-[14px] text-ivory">{cut.code}</span>]);
  if (cut.cut_type) rows.push([he.cut.cutLabel, <>{cutTypeLabel(cut.cut_type)}{cut.sale_mode ? ` · ${he.cut.soldAs[cut.sale_mode]}` : ""}</>]);
  const breed = breedLabel(cut, breeds);
  if (breed) rows.push([he.cut.breed, breed]);
  if (cut.origin_country) rows.push([he.cut.origin, originLabel(cut.origin_country)]);
  if (cut.is_aged != null) {
    rows.push([he.cut.aging, cut.is_aged && cut.aging_days
      ? <>{he.cut.aged(cut.aging_days, agingMethodLabel(cut.aging_method))}</>
      : he.feed.notAged]);
  }
  if (cut.weight_g) {
    rows.push([he.cut.weight, <><Ltr>{formatWeight(cut.weight_g)}</Ltr>{cut.price_per_kg_agorot ? <> · <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr> {he.feed.perKg}</> : null}</>]);
  }
  if (hasSteaks && cut.steak_weight_g) rows.push([he.cut.steakWeight, <Ltr key="s">{he.units.approxG(cut.steak_weight_g)}</Ltr>]);
  if (hasSteaks && cut.steak_thickness_cm) rows.push([he.cut.steakThickness, he.cut.thicknessCm(Number(cut.steak_thickness_cm))]);
  if (cut.published_at) rows.push([he.cut.photographed, formatDateTime(cut.published_at)]);

  return (
    <article className="bg-ink text-start text-ivory">
      <CutPost cut={cut} media={media} breeds={breeds} shop={butcher} now={now} variant="full" eager>
      <div className="flex flex-col gap-6 pt-6 pb-8">
        <div className="h-px bg-line" />
        <section className="flex flex-col gap-3" aria-label={he.cut.certificate}>
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
          <p className="sr-legal m-0">{demo ? he.cut.demoPhoto : he.cut.realPhoto}</p>
        </section>

        {butcher && (
          <section className="flex flex-col gap-1.5">
            <div className="h-px bg-line" />
            <h2 className="sr-eyebrow m-0 mt-5">{he.market.pickupAt(butcher.name)}</h2>
            <p className="m-0 text-[15px] leading-relaxed">{butcher.address}{butcher.pickup_hours ? <>  ·  {isolateTimes(butcher.pickup_hours)}</> : ""}</p>
            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(butcher.address)}`}
              target="_blank" rel="noreferrer"
              className="sr-link w-fit">
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
      {children}
      </CutPost>
    </article>
  );
}
