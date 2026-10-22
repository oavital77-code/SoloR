"use client";
// W4 — calibrating the scale's labels, once: scan one label (or type its digits), type the weight printed on it
// (and the price, for scales that encode the price), and the place of the value in the barcode is found and saved.
// A second label can be scanned to check.
import { useState } from "react";
import { useButcher } from "@/components/butcher/ButcherShell";
import { BarcodeScanner } from "@/components/butcher/flow/BarcodeScanner";
import { FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { Ltr } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { calibrate, isValidEan13, readScale, type ScaleConfig } from "@/lib/barcode";
import { errorText } from "@/lib/errors";
import { formatWeight, shekelsToAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";

const describe = (c: ScaleConfig) => he.flow.scaleFound(c.value_type, c.value_start + 1, c.value_start + c.value_length);

export default function ScaleSettings() {
  const { butcher } = useButcher();
  const toast = useToast();
  const [saved, setSaved] = useState<ScaleConfig | null>(butcher.scale_barcode_config);
  const [code, setCode] = useState("");
  const [grams, setGrams] = useState("");
  const [price, setPrice] = useState("");
  const [found, setFound] = useState<ScaleConfig | null | undefined>(undefined);
  const [scanning, setScanning] = useState<"calibrate" | "test" | null>(null);
  const [test, setTest] = useState<string | null>(null);

  function find() {
    const c = calibrate(code.trim(), Number(grams), price ? shekelsToAgorot(price) : null);
    setFound(c);
  }

  async function save() {
    if (!found) return;
    const { error } = await supabaseBrowser().from("butchers").update({ scale_barcode_config: found }).eq("id", butcher.id);
    if (error) return toast(errorText(error), { tone: "error" });
    butcher.scale_barcode_config = found;
    setSaved(found);
    toast(he.flow.scaleSaved, { tone: "success" });
  }

  return (
    <FlowScreen title={he.flow.scaleTitle} sub={he.flow.scaleLead}
      footer={<button type="button" className="sr-cbtn sr-cbtn--new" disabled={!found} onClick={save}>{he.flow.scaleSave}</button>}>
      <div className="rounded-2xl bg-ink-2 p-3 text-sm shadow-[var(--shadow-card)]">
        <span className="sr-clabel block">{he.flow.scaleCurrent}</span>
        <span className="font-bold">{saved ? describe(saved) : he.flow.scaleDefault}</span>
      </div>

      <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => setScanning("calibrate")}>{he.flow.scaleScan}</button>
      <label className="flex flex-col gap-1.5">
        <span className="sr-clabel">{he.flow.scaleCode}</span>
        <input className="sr-cinput ltr" inputMode="numeric" maxLength={13} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setFound(undefined); }} />
      </label>
      {code.length === 13 && !isValidEan13(code) && <p className="m-0 text-sm font-semibold text-sold">{he.flow.badCode}</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1.5">
          <span className="sr-clabel">{he.flow.scaleGrams}</span>
          <input className="sr-cinput ltr" inputMode="numeric" value={grams} onChange={(e) => { setGrams(e.target.value.replace(/\D/g, "")); setFound(undefined); }} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="sr-clabel">{he.flow.scalePrice}</span>
          <input className="sr-cinput ltr" inputMode="decimal" value={price} onChange={(e) => { setPrice(e.target.value); setFound(undefined); }} />
        </label>
      </div>
      <button type="button" className="sr-cchip" disabled={code.length !== 13 || !grams} onClick={find}>{he.flow.scaleFind}</button>
      {found === null && <p className="m-0 font-semibold text-sold" role="alert">{he.flow.scaleNotFound}</p>}
      {found && <p className="m-0 font-bold text-[var(--status-ready)]" role="status">{describe(found)}</p>}

      {(found || saved) && (
        <>
          <button type="button" className="sr-cchip" onClick={() => setScanning("test")}>{he.flow.scaleTest}</button>
          {test && <p className="m-0 font-bold" role="status"><Ltr>{test}</Ltr></p>}
        </>
      )}

      <BarcodeScanner open={!!scanning} onClose={() => setScanning(null)} title={he.flow.scaleScan}
        onScan={(s) => {
          const which = scanning;
          setScanning(null);
          if (s.type !== "scale") return toast(he.flow.notScale, { tone: "error" });
          if (which === "calibrate") { setCode(s.value); setFound(undefined); return; }
          const r = readScale(s.value, (found || saved)!);
          setTest(r.ok ? he.flow.readFromLabel(formatWeight(r.grams)) : he.flow.badCode);
        }} />
    </FlowScreen>
  );
}
