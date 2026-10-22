"use client";
// LabelOutput (BUTCHER_FLOW chapter 8, §9.4): the item's number in big print — never a weight. ScreenLabel is the
// prototype's: the number on screen, for the butcher to write on the sticker by hand. A printer (PrinterLabel) can
// implement the same interface at the counter station later.
import { BottomSheet } from "../../ui";
import { he } from "@/lib/i18n/he";
import { displayCode } from "@/lib/items";

export interface LabelOutput {
  /** show / print the label of an item ("523-2", "523") */
  output(label: string): void;
}

export function ScreenLabel({ label, onDone }: { label: string | null; onDone: () => void }) {
  if (!label) return null;
  return (
    <BottomSheet open onClose={onDone} title={he.flow.labelTitle}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <div className="flex w-full max-w-[320px] flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ivory bg-white px-4 py-8 text-black">
          <span className="ltr font-[family-name:var(--font-plex-mono)] text-[72px] leading-none font-bold tracking-tight">{label}</span>
          <span className="ltr text-xs tracking-widest">{displayCode(label)}</span>
        </div>
        <p className="m-0 text-sm text-stone">{he.flow.labelHint}</p>
        <button type="button" className="sr-cbtn sr-cbtn--new" onClick={onDone}>{he.flow.labelOk}</button>
      </div>
    </BottomSheet>
  );
}
