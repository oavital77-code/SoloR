"use client";
// WeightInput (BUTCHER_FLOW §9.4, R5, W2/W3): a scan of the scale's label or grams on the big pad. What a scan read
// is shown for confirmation — never taken silently — and can be corrected.
import { useState } from "react";
import { BarcodeScanner } from "./BarcodeScanner";
import { Keypad } from "./Keypad";
import { Ltr } from "../../ui";
import { he } from "@/lib/i18n/he";
import { DEFAULT_SCALE, readScale, type ScaleConfig } from "@/lib/barcode";
import { formatWeight } from "@/lib/pricing";

export function WeightInput({ grams, onChange, scale, pricePerKg, label }: {
  grams: number | null; onChange: (g: number | null, source: "scan" | "manual") => void;
  scale: ScaleConfig | null; pricePerKg?: number | null; label?: string;
}) {
  const [scanning, setScanning] = useState(false);
  const [read, setRead] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const text = grams ? String(grams) : "";

  return (
    <div className="flex flex-col gap-3">
      <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => { setNote(null); setScanning(true); }}>{he.flow.scanWeight}</button>

      {read != null && (
        <div className="flex items-center gap-2 rounded-2xl bg-ink-2 p-3 shadow-[var(--shadow-card)]" role="status">
          <span className="flex-1 font-bold">{he.flow.readFromLabel(formatWeight(read))}</span>
          <button type="button" className="sr-cchip" onClick={() => { onChange(read, "scan"); setRead(null); }}>{he.flow.confirmRead}</button>
          <button type="button" className="sr-cchip" onClick={() => setRead(null)}>{he.flow.fixRead}</button>
        </div>
      )}
      {note && <p className="m-0 text-sm font-semibold text-sold" role="alert">{note}</p>}

      <div className="flex items-baseline justify-between gap-3">
        <span className="sr-clabel">{label ?? he.flow.grams}</span>
        <span className="text-[34px] font-black leading-none tabular-nums"><Ltr>{grams ? he.units.g(grams.toLocaleString("he-IL")) : "—"}</Ltr></span>
      </div>
      <Keypad value={text} max={5} maxValue={50000} onChange={(v) => onChange(v ? Number(v) : null, "manual")} />

      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} title={he.flow.scanWeight}
        onScan={(s) => {
          setScanning(false);
          if (s.type !== "scale") return setNote(he.flow.notScale);
          const r = readScale(s.value, scale ?? DEFAULT_SCALE, pricePerKg);
          if (!r.ok) return setNote(r.reason === "needs_price" ? he.flow.needsPrice : he.flow.badCode);
          if (!scale) setNote(he.flow.notCalibrated);
          setRead(r.grams);
        }} />
    </div>
  );
}
