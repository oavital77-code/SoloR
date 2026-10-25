"use client";
// Buying from a parent cut (BUTCHER_FLOW §6). A unit is bought as it is; the remainder by weight: all of it at the
// price shown, or "פרוס לי" — grams in steps of 50 from 200, up to 95% of what is free (R13/R14), an optional
// thickness, an approximate price that is fixed when the order is placed, and the note that the knife may stray.
// In preview mode (the butcher's confirm screen) everything shows but nothing acts.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Ltr, Stepper } from "./ui";
import { he } from "@/lib/i18n/he";
import { canBuyAll, canSlice, DEFAULT_STEAK_CM, freeG, linePrice, SLICE_MIN_G, SLICE_STEP_G, SLICE_THICKNESS_CM, sliceCapG, sliceSteaks, steakGPerCm, type Held } from "@/lib/items";
import { formatWeight, money } from "@/lib/pricing";
import type { LineMode, SaleItem } from "@/lib/types";

export type OnOrder = (mode: LineMode, grams: number | null, thicknessCm: number | null, total: number) => void;

export function RemainderChooser({ item, held, preview, onOrder, initial, inCart, compact, trays }: {
  item: SaleItem; held?: Held; preview?: boolean; onOrder?: OnOrder;
  /** the trays cut from the same cut: their steaks tell how heavy one steak of it is */
  trays?: Pick<SaleItem, "steak_count" | "weight_g">[];
  /** the line already in the cart, if any */
  initial?: { mode: LineMode; grams: number | null; thicknessCm: number | null } | null;
  inCart?: boolean;
  /** inside the parent page (no own title) */
  compact?: boolean;
}) {
  const allOk = canBuyAll(item, held);
  const sliceOk = canSlice(item, held);
  const cap = sliceCapG(freeG(item, held));
  const [mode, setMode] = useState<LineMode>(initial?.mode === "remainder_slice" || !allOk ? "remainder_slice" : initial?.mode ?? "remainder_all");
  const [grams, setGrams] = useState(Math.max(SLICE_MIN_G, Math.min(initial?.grams ?? 600, cap || SLICE_MIN_G)));
  const [thick, setThick] = useState<number | null>(initial?.thicknessCm ?? null);

  // keep the choice valid while the balance changes live
  useEffect(() => {
    if (mode === "remainder_all" && !allOk && sliceOk) setMode("remainder_slice");
    if (mode === "remainder_slice" && !sliceOk && allOk) setMode("remainder_all");
  }, [mode, allOk, sliceOk]);
  useEffect(() => { if (cap >= SLICE_MIN_G && grams > cap) setGrams(cap); }, [cap, grams]);

  if (!item.price_per_kg_agorot || !item.weight_g) return null;
  const all = linePrice(item, "remainder_all");
  const total = linePrice(item, mode, grams);
  const can = preview || (mode === "remainder_all" ? allOk : sliceOk);
  const whole = !item.split;
  // the same slice in steaks: how many, about how heavy each; choosing a count sets the grams
  const cm = thick ?? DEFAULT_STEAK_CM;
  const gPerCm = steakGPerCm(item, trays);
  const steaks = sliceSteaks(grams, cm, gPerCm);
  const maxSteaks = Math.max(1, Math.floor(Math.max(SLICE_MIN_G, cap) / (gPerCm * cm)));
  const toGrams = (n: number) => {
    const g = Math.round((n * gPerCm * cm) / SLICE_STEP_G) * SLICE_STEP_G;
    return Math.max(SLICE_MIN_G, Math.min(Math.max(SLICE_MIN_G, cap), g));
  };

  return (
    <div className={clsx("flex flex-col gap-3 text-start", !compact && "pt-1")}>
      <div className="flex flex-col gap-2" role="radiogroup" aria-label={he.item.byWeight}>
        <Option active={mode === "remainder_all"} disabled={!preview && !allOk} onClick={() => setMode("remainder_all")}>
          <span className="font-bold">{whole ? he.item.allWhole : he.item.all}</span>
          <span className="text-stone"> · <Ltr>{formatWeight(item.weight_g)}</Ltr></span>
          <span className="ms-auto font-black text-brand"><Ltr>{money(all)}</Ltr></span>
        </Option>
        <Option active={mode === "remainder_slice"} disabled={!preview && !sliceOk} onClick={() => setMode("remainder_slice")}>
          <span className="font-bold">{he.item.sliceMe}</span>
          <span className="text-stone"> · {sliceOk || preview ? he.item.sliceUpTo(formatWeight(cap)) : he.item.tooLittle}</span>
        </Option>
      </div>

      {mode === "remainder_slice" && (sliceOk || preview) && (
        <div className="flex flex-col gap-3 rounded-2xl bg-ink-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{he.item.sliceMe}</span>
            <Stepper dark value={grams} min={SLICE_MIN_G} max={Math.max(SLICE_MIN_G, cap)} step={SLICE_STEP_G} onChange={setGrams}
              label={he.item.sliceMe} format={(v) => he.units.g(v)} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-[13px] text-stone">{he.item.thickness}</span>
            <button type="button" className="sr-fchip" aria-pressed={thick == null} onClick={() => setThick(null)}>
              {he.item.thicknessAny}
            </button>
            {SLICE_THICKNESS_CM.map((cm) => (
              <button key={cm} type="button" className="sr-fchip" aria-pressed={thick === cm} onClick={() => setThick(cm)}>
                {he.cut.thicknessCm(cm)}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{he.item.steaksHow}</span>
            <Stepper dark value={Math.min(steaks.count, maxSteaks)} min={1} max={maxSteaks} onChange={(n) => setGrams(toGrams(n))}
              label={he.item.steaksHow} format={(v) => <Ltr>{v}</Ltr>} />
          </div>
          <p className="m-0 text-[14px] font-semibold text-ivory/90">{he.item.steaksEach(steaks.count, steaks.each, cm)}</p>
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] text-stone">{he.cut.estimatedWeight}</span>
            <span className="text-lg font-black"><Ltr>{he.item.approx(money(total))}</Ltr></span>
          </div>
          <p className="sr-legal m-0">{he.item.sliceNote}</p>
        </div>
      )}

      <button type="button" className="sr-btn sr-btn--block" disabled={preview || !can}
        onClick={() => onOrder?.(mode, mode === "remainder_slice" ? grams : null, mode === "remainder_slice" ? thick : null, total)}>
        {inCart ? he.cart.update : he.cart.add} · <Ltr>{money(total)}</Ltr>
      </button>
    </div>
  );
}

function Option({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={clsx("flex min-h-12 items-center gap-1 rounded-2xl border px-3.5 text-start text-[15px] transition-colors disabled:opacity-40",
        active ? "border-brand bg-ink-2" : "border-line bg-transparent")}>
      <span aria-hidden className={clsx("me-2 grid size-5 shrink-0 place-items-center rounded-full border-2", active ? "border-brand" : "border-stone")}>
        {active && <span className="size-2.5 rounded-full bg-brand" />}
      </span>
      {children}
    </button>
  );
}
