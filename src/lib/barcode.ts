// Reading what the butcher scans (BUTCHER_FLOW §7): the scale's weight labels (EAN-13 starting with "2", where the
// weight — or the price — sits differs between scale makers, so each shop calibrates once, W4) and SoloR's own
// labels (QR "SOL-523" / "SOL-523-1", W6).

/** Where the value sits in the shop's scale labels (butchers.scale_barcode_config, W1). value_start is 0-based. */
export interface ScaleConfig {
  prefix: string;
  value_type: "weight" | "price";
  value_start: number;
  value_length: number;
  /** "g" for weight, "agorot" for price */
  unit: "g" | "agorot";
}

/** The common layout: 2 · type · item code (5) · weight in grams (5) · check digit. */
export const DEFAULT_SCALE: ScaleConfig = { prefix: "2", value_type: "weight", value_start: 7, value_length: 5, unit: "g" };

/** EAN-13 check digit of the first 12 digits. */
export function ean13Check(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  return /^\d{13}$/.test(code) && ean13Check(code.slice(0, 12)) === Number(code[12]);
}

export type ScaleRead = { ok: true; grams: number } | { ok: false; reason: "invalid" | "not_scale" | "needs_price" | "zero" };

/** The weight on a scale label (W2: a bad check digit is refused). A price label needs the price per kg. */
export function readScale(code: string, cfg: ScaleConfig, pricePerKgAgorot?: number | null): ScaleRead {
  const c = code.trim();
  if (!isValidEan13(c)) return { ok: false, reason: "invalid" };
  if (!c.startsWith(cfg.prefix)) return { ok: false, reason: "not_scale" };
  const value = Number(c.slice(cfg.value_start, cfg.value_start + cfg.value_length));
  if (!value) return { ok: false, reason: "zero" };
  if (cfg.value_type === "weight") return { ok: true, grams: value };
  if (!pricePerKgAgorot) return { ok: false, reason: "needs_price" };
  return { ok: true, grams: Math.round((value * 1000) / pricePerKgAgorot) };
}

/**
 * W4: from one label and the weight printed on it, find where the weight sits. Falls back to the price when the
 * label carries a price instead (the printed price is needed then). Returns null when neither is found.
 */
export function calibrate(code: string, grams: number, priceAgorot?: number | null): ScaleConfig | null {
  const c = code.trim();
  if (!isValidEan13(c) || grams < 1) return null;
  const body = c.slice(0, 12);
  const find = (value: number, type: ScaleConfig["value_type"]): ScaleConfig | null => {
    for (const len of [5, 4, 6]) {
      const want = String(value).padStart(len, "0");
      if (want.length !== len) continue;
      // the value ends right before the check digit on most scales; look from there backwards
      for (let start = 12 - len; start >= 2; start--) {
        if (body.slice(start, start + len) === want) {
          return { prefix: c[0], value_type: type, value_start: start, value_length: len, unit: type === "weight" ? "g" : "agorot" };
        }
      }
    }
    return null;
  };
  return find(grams, "weight") ?? (priceAgorot ? find(priceAgorot, "price") : null);
}

export interface SolorLabel { label: string; parentCode: number; unitNo: number | null }

/** "SOL-523-2" (also inside a link) → the item it names */
export function readSolorLabel(text: string): SolorLabel | null {
  const m = text.trim().toUpperCase().match(/SOL-(\d{1,7})(?:-(\d{1,4}))?(?![\d-])/);
  if (!m) return null;
  const parentCode = Number(m[1]);
  const unitNo = m[2] ? Number(m[2]) : null;
  return { label: unitNo ? `${parentCode}-${unitNo}` : String(parentCode), parentCode, unitNo };
}

export type Scan = { type: "solor"; value: SolorLabel } | { type: "scale"; value: string } | { type: "unknown"; value: string };

/** W6: SoloR's labels are QR codes with "SOL-…"; scale labels are EAN-13 starting with "2". */
export function classifyScan(text: string): Scan {
  const solor = readSolorLabel(text);
  if (solor) return { type: "solor", value: solor };
  const digits = text.trim();
  if (/^2\d{12}$/.test(digits)) return { type: "scale", value: digits };
  return { type: "unknown", value: text.trim() };
}

/** For tests and the calibration screen: a valid label with a weight at the default place. */
export function makeScaleLabel(itemCode: string, grams: number): string {
  const first12 = `21${itemCode.padStart(5, "0").slice(-5)}${String(grams).padStart(5, "0")}`;
  return first12 + ean13Check(first12);
}
