import { describe, expect, it } from "vitest";
import { readSolorLabel } from "./barcode";

describe("item labels", () => {
  it("reads a tray, a block, typed or printed", () => {
    expect(readSolorLabel("SOL-15-09")).toEqual({ label: "15-09", parentCode: 15, unitNo: 9 });
    expect(readSolorLabel(" 15-9 ")).toEqual({ label: "15-09", parentCode: 15, unitNo: 9 });
    expect(readSolorLabel("15-12")).toEqual({ label: "15-12", parentCode: 15, unitNo: 12 });
    expect(readSolorLabel("15")).toEqual({ label: "15", parentCode: 15, unitNo: null });
    expect(readSolorLabel("https://solor.app/cut/x?l=sol-15")).toEqual({ label: "15", parentCode: 15, unitNo: null });
    expect(readSolorLabel("hello")).toBeNull();
  });
});
