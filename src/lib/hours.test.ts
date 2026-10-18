import { describe, expect, it } from "vitest";
import { closesAt, formatWeek, isolateTimes, weekRows, isOpenNow, type OpeningHours } from "./hours";

const week: OpeningHours = {
  "0": [["08:00", "19:00"]], "1": [["08:00", "19:00"]], "2": [["08:00", "19:00"]],
  "3": [["08:00", "19:00"]], "4": [["08:00", "19:00"]], "5": [["07:00", "14:00"]],
};

describe("opening hours", () => {
  it("is open inside a range and closed outside it, in Israel time", () => {
    // Sunday 18.10.2026: Israel is UTC+3 (summer time until 25.10)
    expect(isOpenNow(week, new Date("2026-10-18T06:00:00Z"))).toBe(true);   // 09:00
    expect(isOpenNow(week, new Date("2026-10-18T16:30:00Z"))).toBe(false);  // 19:30
    expect(isOpenNow(week, new Date("2026-10-18T04:59:00Z"))).toBe(false);  // 07:59
  });

  it("knows Saturday is closed and Friday is short", () => {
    expect(isOpenNow(week, new Date("2026-10-17T08:00:00Z"))).toBe(false);  // Saturday 11:00
    expect(isOpenNow(week, new Date("2026-10-16T10:00:00Z"))).toBe(true);   // Friday 13:00
    expect(isOpenNow(week, new Date("2026-10-16T11:30:00Z"))).toBe(false);  // Friday 14:30
  });

  it("has no answer without hours", () => {
    expect(isOpenNow(null)).toBeNull();
    expect(formatWeek(null)).toBe("");
  });

  it("joins days with the same hours", () => {
    expect(formatWeek(week).replace(/[\u2066\u2069]/g, "")).toBe("א׳–ה׳ 08:00–19:00  ·  ו׳ 07:00–14:00");
  });
  it("keeps free-text time ranges left to right", () => {
    expect(isolateTimes("ו׳ 09:00-12:00")).toBe("ו׳ \u206609:00-12:00\u2069");
    expect(isolateTimes("עד 14:00")).toBe("עד \u206614:00\u2069");
  });
  it("lists the week as rows for the hours card, closed days kept", () => {
    const h: OpeningHours = { "0": [["08:00", "20:00"]], "1": [["08:00", "20:00"]], "2": [["08:00", "20:00"]], "3": [["08:00", "20:00"]], "4": [["08:00", "20:00"]], "5": [["07:00", "14:00"]] };
    expect(weekRows(h)).toEqual([
      { days: "ראשון–חמישי", ranges: "08:00–20:00" }, { days: "שישי", ranges: "07:00–14:00" }, { days: "שבת", ranges: null },
    ]);
    expect(closesAt(h, new Date("2026-10-18T10:00:00Z"))).toBe("20:00"); // Sunday 13:00 in Israel
    expect(closesAt(h, new Date("2026-10-17T10:00:00Z"))).toBeNull();     // Saturday
  });
});
