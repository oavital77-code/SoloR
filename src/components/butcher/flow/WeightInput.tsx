"use client";
// WeightInput (BUTCHER_FLOW §9.4, R5): the weight in grams on the big pad. Scanning the scale's label is left out for
// now (founders' decision 22.10.2026: the butcher types the weight).
import { Keypad } from "./Keypad";
import { Ltr } from "../../ui";
import { he } from "@/lib/i18n/he";

export function WeightInput({ grams, onChange, label }: {
  grams: number | null; onChange: (g: number | null, source: "manual") => void; label?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="sr-clabel">{label ?? he.flow.grams}</span>
        <span className="text-[34px] font-black leading-none tabular-nums"><Ltr>{grams ? he.units.g(grams.toLocaleString("he-IL")) : "—"}</Ltr></span>
      </div>
      <Keypad value={grams ? String(grams) : ""} max={5} maxValue={50000} onChange={(v) => onChange(v ? Number(v) : null, "manual")} />
    </div>
  );
}
