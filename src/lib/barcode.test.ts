import { describe, expect, it } from "vitest";
import { readSolorLabel } from "./barcode";

describe("item labels", () => {
  it("reads a unit, a remainder, typed or printed", () => {
    expect(readSolorLabel("SOL-523-2")).toEqual({ label: "523-2", parentCode: 523, unitNo: 2 });
    expect(readSolorLabel(" 523-2 ")).toEqual({ label: "523-2", parentCode: 523, unitNo: 2 });
    expect(readSolorLabel("523")).toEqual({ label: "523", parentCode: 523, unitNo: null });
    expect(readSolorLabel("https://solor.app/cut/x?l=sol-523")).toEqual({ label: "523", parentCode: 523, unitNo: null });
    expect(readSolorLabel("hello")).toBeNull();
  });
});
