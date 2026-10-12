"use client";
// C3 — filter bottom sheet with a live "show X cuts" counter.
import { useEffect, useState } from "react";
import { BottomSheet, Button, Chip, Ltr, Toggle } from "../ui";
import { he } from "@/lib/i18n/he";
import { CUT_TYPES, ORIGINS } from "@/lib/labels";
import { EMPTY_FILTER, PRICE_SLIDER, matchesFilter, type FeedFilter } from "@/lib/feed-filter";
import type { Breed, Cut } from "@/lib/types";

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterSheet({ open, onClose, value, onApply, cuts, breeds }: {
  open: boolean; onClose: () => void; value: FeedFilter; onApply: (f: FeedFilter) => void; cuts: Cut[]; breeds: Breed[];
}) {
  const [f, setF] = useState<FeedFilter>(value);
  useEffect(() => { if (open) setF(value); }, [open, value]);
  const count = cuts.filter((c) => matchesFilter(c, f)).length;
  const lo = f.priceMin ?? PRICE_SLIDER.min;
  const hi = f.priceMax ?? PRICE_SLIDER.max;

  return (
    <BottomSheet open={open} onClose={onClose} title={he.filter.title} dark>
      <div className="flex flex-col gap-6">
        <Group title={he.filter.cutType}>
          {CUT_TYPES.map((c) => (
            <Chip dark key={c.key} selected={f.cutTypes.includes(c.key)} onClick={() => setF({ ...f, cutTypes: toggle(f.cutTypes, c.key) })}>{c.label}</Chip>
          ))}
        </Group>
        <Group title={he.filter.breed}>
          {breeds.map((b) => (
            <Chip dark key={b.key} selected={f.breeds.includes(b.key)} onClick={() => setF({ ...f, breeds: toggle(f.breeds, b.key) })}>{b.label_he}</Chip>
          ))}
          <Chip dark selected={f.breeds.includes("other")} onClick={() => setF({ ...f, breeds: toggle(f.breeds, "other") })}>{he.filter.other}</Chip>
        </Group>
        <Group title={he.filter.origin}>
          {ORIGINS.map((o) => (
            <Chip dark key={o.key} selected={f.origins.includes(o.key)} onClick={() => setF({ ...f, origins: toggle(f.origins, o.key) })}>
              <span className="me-1">{o.flag}</span>{o.label}
            </Chip>
          ))}
        </Group>

        <Toggle dark label={he.filter.agedOnly} checked={f.agedOnly} onChange={(v) => setF({ ...f, agedOnly: v })} />

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-bold">{he.filter.priceRange}</h3>
            <span className="text-sm text-white/70">
              <Ltr>₪{lo / 100} – ₪{hi / 100}{hi >= PRICE_SLIDER.max ? "+" : ""}</Ltr>
            </span>
          </div>
          <DualRange
            min={PRICE_SLIDER.min} max={PRICE_SLIDER.max} step={PRICE_SLIDER.step} low={lo} high={hi}
            onChange={(l, h) => setF({ ...f, priceMin: l <= PRICE_SLIDER.min ? null : l, priceMax: h >= PRICE_SLIDER.max ? null : h })}
          />
        </section>

        <Group title={he.filter.saleMode}>
          <Chip dark selected={f.canWhole} onClick={() => setF({ ...f, canWhole: !f.canWhole })}>{he.filter.canWhole}</Chip>
          <Chip dark selected={f.canSteaks} onClick={() => setF({ ...f, canSteaks: !f.canSteaks })}>{he.filter.canSteaks}</Chip>
        </Group>

        <div className="sticky bottom-0 -mx-5 flex gap-3 bg-ink-2 px-5 pt-3">
          <Button size="lg" className="flex-[2]" onClick={() => { onApply(f); onClose(); }}>{he.filter.show(count)}</Button>
          <Button size="lg" variant="dark" className="flex-1" onClick={() => setF(EMPTY_FILTER)}>{he.filter.clearAll}</Button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 font-bold">{title}</h3>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

/** Two overlaid range inputs = a two-thumb slider. */
function DualRange({ min, max, step, low, high, onChange }: {
  min: number; max: number; step: number; low: number; high: number; onChange: (l: number, h: number) => void;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const thumb =
    "pointer-events-none absolute inset-0 h-11 w-full appearance-none bg-transparent " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-brand " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-brand";
  return (
    <div className="relative h-11" dir="ltr">
      <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-white/15" />
      <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand" style={{ left: `${pct(low)}%`, right: `${100 - pct(high)}%` }} />
      <input type="range" aria-label="מחיר מינימלי" min={min} max={max} step={step} value={low} className={thumb}
        onChange={(e) => onChange(Math.min(Number(e.target.value), high - step), high)} />
      <input type="range" aria-label="מחיר מקסימלי" min={min} max={max} step={step} value={high} className={thumb}
        onChange={(e) => onChange(low, Math.max(Number(e.target.value), low + step))} />
    </div>
  );
}
