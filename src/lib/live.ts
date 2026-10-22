// What happened at the counters, newest first (design: V3's "מה קורה בדלפקים" and the red "עכשיו" strip): a parent
// cut went up to the counter (once, however many items it has), an item sold out. Read from the catalog the feed
// already holds, so it moves with every realtime update.
import { cutTitle } from "./cut-helpers";
import { he } from "./i18n/he";
import type { Breed, Butcher, SaleItem } from "./types";

export interface LiveEvent { id: string; at: string; kind: "posted" | "sold"; text: string; code: string; parentCode: number }

export function liveEvents(items: SaleItem[], butchers: Pick<Butcher, "id" | "name">[], breeds: Breed[], limit = 8): LiveEvent[] {
  const shop = (id: string) => butchers.find((b) => b.id === id)?.name ?? "";
  const out: LiveEvent[] = [];
  const posted = new Map<number, LiveEvent>();
  for (const c of items) {
    const name = cutTitle(c, breeds);
    if (c.published_at) {
      const cur = posted.get(c.parent_code);
      if (!cur || c.published_at < cur.at) {
        posted.set(c.parent_code, { id: `p-${c.parent_code}`, at: c.published_at, kind: "posted", text: he.live.posted(shop(c.butcher_id), name),
          code: `SOL-${c.parent_code}`, parentCode: c.parent_code });
      }
    }
    if (c.status === "sold_out" && c.sold_out_at) {
      out.push({ id: `s-${c.id}`, at: c.sold_out_at, kind: "sold", text: he.live.sold(`${name} ${c.label}`, shop(c.butcher_id)),
        code: c.code, parentCode: c.parent_code });
    }
  }
  return [...out, ...posted.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
