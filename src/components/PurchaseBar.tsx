"use client";
// Sticky purchase area of the cut page (C4). In preview mode it renders identically but disabled.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button, Ltr, Stepper } from "./ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight, steaksOrderPrice, wholePrice } from "@/lib/pricing";
import type { Cut, OrderMode } from "@/lib/types";

export function PurchaseBar({ cut, preview, inline, onOrder }: {
  cut: Cut; preview?: boolean; inline?: boolean; onOrder?: (mode: OrderMode, qty: number | null) => void;
}) {
  const pos = inline ? "relative" : "sticky bottom-0 z-20";
  const offersWhole = cut.sale_mode === "whole" || cut.sale_mode === "both";
  const offersSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const wholeOk = canBuyWhole(cut);
  const steaksOk = canBuySteaks(cut);
  const soldOut = cut.status !== "published" || (!wholeOk && !steaksOk);

  const defaultMode: OrderMode = offersSteaks && (steaksOk || !wholeOk) ? "steaks" : "whole";
  const [mode, setMode] = useState<OrderMode>(defaultMode);
  const [qty, setQty] = useState(1);

  // keep the selection valid while stock changes live
  useEffect(() => {
    if (mode === "whole" && !wholeOk && steaksOk) setMode("steaks");
    if (mode === "steaks" && !offersSteaks) setMode("whole");
  }, [mode, wholeOk, steaksOk, offersSteaks]);
  useEffect(() => {
    if (qty > cut.steaks_available && cut.steaks_available > 0) setQty(cut.steaks_available);
  }, [qty, cut.steaks_available]);

  if (!cut.sale_mode || !cut.price_per_kg_agorot || !cut.weight_g) return null;

  const total = mode === "whole"
    ? wholePrice(cut.weight_g, cut.price_per_kg_agorot)
    : steaksOrderPrice(cut.steak_weight_g ?? 0, cut.price_per_kg_agorot, qty);

  if (soldOut) {
    return (
      <div className={`${pos} border-t border-white/10 bg-ink-2/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur`}>
        <div className="mb-3 rounded-2xl bg-white/10 py-3 text-center text-lg font-extrabold">{he.cut.soldBanner}</div>
        <Button size="lg" className="w-full" disabled>{he.cut.order}</Button>
      </div>
    );
  }

  return (
    <div className={`${pos} border-t border-white/10 bg-ink-2/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-white backdrop-blur`}>
      {offersWhole && offersSteaks && (
        <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup">
          <ModeButton label={he.cut.steaks} active={mode === "steaks"} disabled={!steaksOk} onClick={() => setMode("steaks")} />
          <ModeButton label={he.cut.whole} active={mode === "whole"} disabled={!wholeOk} onClick={() => setMode("whole")} />
        </div>
      )}
      {offersWhole && !wholeOk && cut.sale_mode === "both" && (
        <p className="mb-3 text-sm text-white/60">{he.cut.wholeBlocked}</p>
      )}

      {mode === "steaks" && cut.steak_weight_g && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <Stepper dark value={qty} min={1} max={Math.max(1, cut.steaks_available)} onChange={setQty} label={he.cut.steaks} />
          <p className="text-end text-sm text-white/70">
            {he.cut.steaksSummary(qty, cut.steak_weight_g, formatWeight(cut.steak_weight_g * qty))}
          </p>
        </div>
      )}
      {mode === "whole" && (
        <p className="mb-3 text-sm text-white/70">{he.cut.whole} · <Ltr>{formatWeight(cut.weight_g)}</Ltr></p>
      )}

      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="text-3xl font-extrabold"><Ltr>₪{formatAgorot(total)}</Ltr></div>
          <div className="text-xs text-white/55">{he.cut.priceNote}</div>
        </div>
        <Button
          size="lg" className="min-w-32"
          disabled={preview || (mode === "whole" ? !wholeOk : !steaksOk)}
          onClick={() => onOrder?.(mode, mode === "steaks" ? qty : null)}
        >
          {he.cut.order}
        </Button>
      </div>
    </div>
  );
}

function ModeButton({ label, active, disabled, onClick }: { label: string; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={clsx(
        "min-h-12 rounded-2xl font-bold transition-colors disabled:opacity-35",
        active ? "bg-white text-neutral-900" : "bg-white/10 text-white ring-1 ring-white/15",
      )}
    >
      {label}
    </button>
  );
}
