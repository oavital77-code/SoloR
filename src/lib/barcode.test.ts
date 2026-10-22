import { describe, expect, it } from "vitest";
import { calibrate, classifyScan, DEFAULT_SCALE, ean13Check, isValidEan13, makeScaleLabel, readScale, readSolorLabel } from "./barcode";

describe("scale labels (BUTCHER_FLOW §7)", () => {
  it("checks the EAN-13 digit", () => {
    expect(ean13Check("400638133393")).toBe(1);
    expect(isValidEan13("4006381333931")).toBe(true);
    expect(isValidEan13("4006381333932")).toBe(false);
  });

  it("reads the grams at the configured place (the spec's example: 2 1 12345 01240 7)", () => {
    const code = makeScaleLabel("12345", 1240);
    expect(code.slice(0, 12)).toBe("211234501240");
    expect(readScale(code, DEFAULT_SCALE)).toEqual({ ok: true, grams: 1240 });
  });

  it("refuses a damaged label (W2)", () => {
    const code = makeScaleLabel("12345", 1240);
    const bad = code.slice(0, 12) + ((Number(code[12]) + 1) % 10);
    expect(readScale(bad, DEFAULT_SCALE)).toEqual({ ok: false, reason: "invalid" });
  });

  it("turns a price label into grams with the price per kg", () => {
    const first12 = "220001027280";                 // ₪272.80 at 220/kg = 1,240 g
    const code = first12 + ean13Check(first12);
    const cfg = { ...DEFAULT_SCALE, value_type: "price" as const, unit: "agorot" as const };
    expect(readScale(code, cfg)).toEqual({ ok: false, reason: "needs_price" });
    expect(readScale(code, cfg, 22000)).toEqual({ ok: true, grams: 1240 });
  });

  it("calibrates from one label and its printed weight (W4)", () => {
    const first12 = "200123012400";                 // weight in grams at 0-based 6, 5 digits — another maker
    const code = first12 + ean13Check(first12);
    const cfg = calibrate(code, 1240)!;
    expect(cfg).toMatchObject({ value_type: "weight", value_start: 6, value_length: 5 });
    expect(readScale(code, cfg)).toEqual({ ok: true, grams: 1240 });
    expect(calibrate(code, 999)).toBeNull();
  });
});

describe("SoloR labels", () => {
  it("tells units, remainders and scale labels apart (W6)", () => {
    expect(readSolorLabel("SOL-523-2")).toEqual({ label: "523-2", parentCode: 523, unitNo: 2 });
    expect(readSolorLabel("https://solor.app/cut/x?l=sol-523")).toEqual({ label: "523", parentCode: 523, unitNo: null });
    expect(classifyScan("SOL-523").type).toBe("solor");
    expect(classifyScan(makeScaleLabel("1", 830)).type).toBe("scale");
    expect(classifyScan("hello").type).toBe("unknown");
  });
});
