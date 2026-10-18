// Shop opening hours (customer spec §7.1): "open now / closed" and a compact week line, always in Israel time.
// Shape matches butchers.opening_hours: day "0" (Sunday) … "6" (Saturday) → [["08:00","19:00"], …].

export type OpeningHours = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", [string, string][]>>;

const DAY_LETTER = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const;

/** Day of week (0 = Sunday) and minutes since midnight in Israel for this instant. */
export function israelClock(at: Date): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: WEEKDAY[get("weekday") as keyof typeof WEEKDAY], minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function isOpenNow(hours: OpeningHours | null | undefined, at = new Date()): boolean | null {
  if (!hours) return null;
  const { day, minutes } = israelClock(at);
  return (hours[String(day) as keyof OpeningHours] ?? []).some(([from, to]) => minutes >= toMinutes(from) && minutes < toMinutes(to));
}

/** "א׳–ה׳ 08:00–19:00 · ו׳ 08:00–14:00": consecutive days with the same hours are joined; closed days are left out. */
export function formatWeek(hours: OpeningHours | null | undefined): string {
  if (!hours) return "";
  // each range is isolated left-to-right, so "08:00–19:00" does not flip inside a Hebrew line
  const label = (d: number) => (hours[String(d) as keyof OpeningHours] ?? []).map(([a, b]) => `\u2066${a}–${b}\u2069`).join(", ");
  const groups: { from: number; to: number; text: string }[] = [];
  for (let d = 0; d < 7; d++) {
    const text = label(d);
    const last = groups[groups.length - 1];
    if (text && last && last.text === text && last.to === d - 1) last.to = d;
    else if (text) groups.push({ from: d, to: d, text });
  }
  return groups
    .map((g) => `${g.from === g.to ? DAY_LETTER[g.from] : `${DAY_LETTER[g.from]}–${DAY_LETTER[g.to]}`} ${g.text}`)
    .join("  ·  ");
}

/** Free text with times ("ו׳ 09:00-12:00"): each time range kept left-to-right, so it does not flip in a Hebrew line. */
export function isolateTimes(text: string): string {
  return text.replace(/\d{1,2}:\d{2}(?:\s*[–-]\s*\d{1,2}:\d{2})?/g, (m) => `\u2066${m}\u2069`);
}
