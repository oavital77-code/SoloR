"use client";
// The big number pad (BUTCHER_FLOW §5: busy hands, minimum typing): 3×4 keys of at least 64px.
import { he } from "@/lib/i18n/he";

export function Keypad({ value, onChange, max = 6, maxValue, decimal }: {
  value: string; onChange: (v: string) => void; max?: number;
  /** the largest number that may be typed (a key that would pass it does nothing) */
  maxValue?: number; decimal?: boolean;
}) {
  const press = (k: string) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "." && (!decimal || value.includes("."))) return;
    if (value.replace(".", "").length >= max) return;
    if (/\.\d{2}$/.test(value)) return;                       // two digits after the point at most
    const next = k !== "." && value === "0" ? k : value + k;
    if (maxValue != null && Number(next) > maxValue) return;
    onChange(next);
  };
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "", "0", "⌫"];
  return (
    <div className="grid grid-cols-3 gap-2" dir="ltr">
      {keys.map((k, i) => k ? (
        <button key={i} type="button" onClick={() => press(k)} aria-label={k === "⌫" ? he.flow.backspace : k}
          className="min-h-16 rounded-2xl bg-ink-2 text-[26px] font-bold shadow-[var(--shadow-card)] active:scale-[0.97]">
          {k}
        </button>
      ) : <span key={i} />)}
    </div>
  );
}
