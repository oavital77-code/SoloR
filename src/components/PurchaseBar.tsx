"use client";
// Sticky purchase area of the cut page (C4): choose whole / steaks and quantity, then add to the cart.
// In preview mode (butcher wizard) it renders identically but disabled.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Button, Ltr, Stepper } from "./ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight, steaksOrderPrice, wholePrice } from "@/lib/pricing";
import type { Cut, OrderMode } from "@/lib/types";

export function PurchaseBar({ cut, preview, inline, onOrder, initialMode, initialQty, inCart }: {
  cut: Cut; preview?: boolean; inline?: boolean; onOrder?: (mode: OrderMode, qty: number | null, total: number) => void;
  /** the line already in the cart, if any */
  initialMode?: OrderMode | null; initialQty?: number | null; inCart?: boolean;
}) {
  const pos = inline ? "relative" : "sticky bottom-0 z-20";
  const offersWhole = cut.sale_mode === "whole" || cut.sale_mode === "both";
  const offersSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const wholeOk = canBuyWhole(cut);
  const steaksOk = canBuySteaks(cut);
  const soldOut = cut.status !== "published" || (!wholeOk && !steaksOk);

  const defaultMode: OrderMode = offersSteaks && (steaksOk || !wholeOk) ? "steaks" : "whole";
  const [mode, setMode] = useState<OrderMode>(initialMode ?? defaultMode);
  const [qty, setQty] = useState(initialQty && initialQty > 0 ? initialQty : 1);

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
      <div className={`${pos} border-t border-ivory/10 bg-ink-2/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur`}>
        <div className="mb-3 py-2 text-center font-display text-2xl font-bold text-ivory/80">{he.cut.soldBanner}</div>
        <Button size="lg" className="w-full" disabled>{he.cart.add}</Button>
      </div>
    );
  }

  return (
    <div className={`${pos} border-t border-ivory/10 bg-ink-2/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-ivory backdrop-blur`}>
      {offersWhole && offersSteaks && (
        <div className="mb-3 grid grid-cols-2 gap-2" role="radiogroup">
          <ModeButton label={he.cut.steaks} active={mode === "steaks"} disabled={!steaksOk} onClick={() => setMode("steaks")} />
          <ModeButton label={he.cut.whole} active={mode === "whole"} disabled={!wholeOk} onClick={() => setMode("whole")} />
        </div>
      )}
      {offersWhole && !wholeOk && cut.sale_mode === "both" && (
        <p className="-mt-1 mb-2 text-center text-xs text-stone">{he.cut.wholeBlocked}</p>
      )}

      {mode === "steaks" && cut.steak_weight_g && (
        <div className="mb-3 flex flex-col items-center gap-1.5">
          <Stepper dark value={qty} min={1} max={Math.max(1, cut.steaks_available)} onChange={setQty} label={he.cut.steaks} />
          <p className="text-sm text-stone">
            {he.cut.steaksSummary(qty, cut.steak_weight_g, formatWeight(cut.steak_weight_g * qty))}
          </p>
        </div>
      )}
      {mode === "whole" && (
        <p className="mb-3 text-center text-sm text-stone">{he.cut.whole} · <Ltr>{formatWeight(cut.weight_g)}</Ltr></p>
      )}

      <div className="flex items-center justify-center gap-6 text-center">
        <div>
          <div className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(total)}</Ltr></div>
          <div className="text-xs text-stone">{he.cut.priceNote}</div>
        </div>
        <Button
          size="lg" className="min-w-40"
          disabled={preview || (mode === "whole" ? !wholeOk : !steaksOk)}
          onClick={() => onOrder?.(mode, mode === "steaks" ? qty : null, total)}
        >
          {inCart ? he.cart.update : he.cart.add}
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
        "min-h-11 rounded-xl font-bold transition-colors disabled:opacity-35",
        active ? "bg-ivory text-ink" : "text-ivory ring-1 ring-ivory/20",
      )}
    >
      {label}
    </button>
  );
}
