"use client";
// LabelOutput (BUTCHER_FLOW chapter 8, §9.4): a SoloR label is a QR with "SOL-523-2" and the number in big print —
// never a weight. ScreenLabel is the prototype's: the label on screen, to copy onto a sticker by hand.
// PrinterLabel (the counter station's label printer) is a later implementation of the same interface.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BottomSheet } from "../../ui";
import { he } from "@/lib/i18n/he";
import { displayCode } from "@/lib/items";

export interface LabelOutput {
  /** show / print the label of an item ("523-2", "523") */
  output(label: string): void;
}

export function ScreenLabel({ label, onDone }: { label: string | null; onDone: () => void }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (!label) return;
    QRCode.toString(displayCode(label), { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setSvg).catch(() => setSvg(""));
  }, [label]);
  if (!label) return null;
  return (
    <BottomSheet open onClose={onDone} title={he.flow.labelTitle}>
      <div className="flex flex-col items-center gap-4 pb-2 text-center">
        <div className="flex w-full max-w-[320px] flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-ivory bg-white p-4 text-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {svg && <img alt={displayCode(label)} className="size-40" src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} />}
          <span className="ltr font-[family-name:var(--font-plex-mono)] text-[56px] leading-none font-bold tracking-tight">{label}</span>
          <span className="ltr text-xs tracking-widest">{displayCode(label)}</span>
        </div>
        <p className="m-0 text-sm text-stone">{he.flow.labelHint}</p>
        <button type="button" className="sr-cbtn sr-cbtn--new" onClick={onDone}>{he.flow.labelOk}</button>
      </div>
    </BottomSheet>
  );
}
