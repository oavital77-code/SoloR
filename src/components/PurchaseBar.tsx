"use client";
// Buying one cut (design: AddSheet, Cut). AddChooser is the sheet's content: whole or steaks as a segmented choice
// with each one's price, how many steaks, the estimated weight, the weight rule in its own words, and one bordeaux
// button with the total. PurchaseBar is the cut page's sticky bar: the unit price, the whole price beside it, and
// "הוסף לסל", which opens the chooser. In preview mode (the butcher's wizard) everything shows but nothing acts.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { IconClock, IconClose, IconPlus } from "./icons";
import { BottomSheet, Ltr, Stepper } from "./ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight, steakPrice, steaksOrderPrice, wholePrice } from "@/lib/pricing";
import type { Cut, OrderMode } from "@/lib/types";

const money = (a: number) => `₪${formatAgorot(a).replace(/\.00$/, "")}`;

type OnOrder = (mode: OrderMode, qty: number | null, total: number) => void;

export function AddChooser({ cut, preview, onOrder, initialMode, initialQty, inCart }: {
  cut: Cut; preview?: boolean; onOrder?: OnOrder;
  /** the line already in the cart, if any */
  initialMode?: OrderMode | null; initialQty?: number | null; inCart?: boolean;
}) {
  const offersWhole = cut.sale_mode === "whole" || cut.sale_mode === "both";
  const offersSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const wholeOk = canBuyWhole(cut);
  const steaksOk = canBuySteaks(cut);

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
  const ppk = cut.price_per_kg_agorot;
  const whole = wholePrice(cut.weight_g, ppk);
  const steak = cut.steak_weight_g ? steakPrice(cut.steak_weight_g, ppk) : 0;
  const total = mode === "whole" ? whole : steaksOrderPrice(cut.steak_weight_g ?? 0, ppk, qty);
  const weight = mode === "whole" ? cut.weight_g : (cut.steak_weight_g ?? 0) * qty;
  const can = mode === "whole" ? wholeOk : steaksOk;

  return (
    <div className="flex flex-col gap-4 text-start">
      {offersWhole && offersSteaks && (
        <div className="grid grid-cols-2 gap-1.5 rounded-full bg-ink-3 p-1" role="radiogroup" aria-label={he.post.chooseTitle}>
          <Seg label={<>{he.cut.whole} · <Ltr>{money(whole)}</Ltr></>} active={mode === "whole"} disabled={!wholeOk} onClick={() => setMode("whole")} />
          <Seg label={<>{he.cut.steaks} · <Ltr>{money(steak)}</Ltr></>} active={mode === "steaks"} disabled={!steaksOk} onClick={() => setMode("steaks")} />
        </div>
      )}
      {offersWhole && !wholeOk && cut.sale_mode === "both" && <p className="-mt-2 text-xs text-stone">{he.cut.wholeBlocked}</p>}

      {mode === "steaks" && cut.steak_weight_g ? (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-semibold">{he.cut.howManySteaks}</div>
            <div className="text-[13px] text-stone">
              {cut.steak_thickness_cm ? he.cut.thicknessHint(Number(cut.steak_thickness_cm)) : he.cut.aboutGrams(cut.steak_weight_g)}
              {" · "}{he.cut.steaksLeft(cut.steaks_available)}
            </div>
          </div>
          <Stepper dark value={qty} min={1} max={Math.max(1, cut.steaks_available)} onChange={setQty} label={he.cut.steaks} />
        </div>
      ) : null}

      <div className="h-px bg-line" />
      <div className="sr-rowline"><span className="text-stone">{he.cut.estimatedWeight}</span><Ltr>{formatWeight(weight)}</Ltr></div>
      <p className="sr-legal m-0">{he.cut.weightRuleShort}</p>
      <button type="button" className="sr-btn sr-btn--block" disabled={preview || !can}
        onClick={() => onOrder?.(mode, mode === "steaks" ? qty : null, total)}>
        {inCart ? he.cart.update : he.cart.add} · <Ltr>{money(total)}</Ltr>
      </button>
    </div>
  );
}

/** The cut page's sticky bar: the price of one unit, the whole cut beside it, and the way to choose. */
export function PurchaseBar({ cut, preview, inline, onOrder, initialMode, initialQty, inCart }: {
  cut: Cut; preview?: boolean; inline?: boolean; onOrder?: OnOrder;
  initialMode?: OrderMode | null; initialQty?: number | null; inCart?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!cut.sale_mode || !cut.price_per_kg_agorot || !cut.weight_g) return null;
  const ppk = cut.price_per_kg_agorot;
  const steaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steak_weight_g;
  const whole = wholePrice(cut.weight_g, ppk);
  const soldOut = cut.status !== "published" || (!canBuyWhole(cut) && !canBuySteaks(cut));

  return (
    <div className={clsx(inline ? "relative" : "sticky bottom-0 z-20",
      "flex items-center gap-3.5 bg-gradient-to-b from-transparent to-ink to-30% px-4 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]")}>
      <div className="flex flex-col">
        <span className={clsx("sr-price", soldOut && "text-stone")}>
          <Ltr>{money(steaks ? steakPrice(cut.steak_weight_g!, ppk) : whole)}</Ltr> <small>{steaks ? he.post.perSteakShort : he.post.wholeShort}</small>
        </span>
        {steaks && cut.sale_mode === "both" && <span className="sr-meta">{he.cut.orWhole(money(whole))}</span>}
      </div>
      {soldOut ? (
        <button type="button" disabled className="sr-btn flex-1"><IconClose />{he.post.soldStamp}</button>
      ) : (
        <button type="button" disabled={preview} onClick={() => setOpen(true)} className="sr-btn flex-1">
          {cut.status === "published" ? <IconPlus /> : <IconClock />}{inCart ? he.cart.update : he.cart.add}
        </button>
      )}
      {open && (
        <BottomSheet open dark title={he.post.chooseTitle} onClose={() => setOpen(false)}>
          <AddChooser cut={cut} preview={preview} inCart={inCart} initialMode={initialMode} initialQty={initialQty}
            onOrder={(m, q, t) => { onOrder?.(m, q, t); setOpen(false); }} />
        </BottomSheet>
      )}
    </div>
  );
}

function Seg({ label, active, disabled, onClick }: { label: React.ReactNode; active: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={active} disabled={disabled} onClick={onClick}
      className={clsx("inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors disabled:opacity-35",
        active ? "bg-ivory text-ink" : "text-stone")}>
      {label}
    </button>
  );
}
