// What happened at the counters, newest first (design: V3's "מה קורה בדלפקים" and the red "עכשיו" strip): a cut
// went live, a cut sold out. Read from the catalog the feed already holds, so it moves with every realtime update.
import { cutTitle } from "./cut-helpers";
import { he } from "./i18n/he";
import type { Breed, Butcher, Cut } from "./types";

export interface LiveEvent { id: string; at: string; kind: "posted" | "sold"; text: string; code: string }

export function liveEvents(cuts: Cut[], butchers: Pick<Butcher, "id" | "name">[], breeds: Breed[], limit = 8): LiveEvent[] {
  const shop = (id: string) => butchers.find((b) => b.id === id)?.name ?? "";
  const out: LiveEvent[] = [];
  for (const c of cuts) {
    const name = cutTitle(c, breeds);
    if (c.published_at) out.push({ id: `p-${c.id}`, at: c.published_at, kind: "posted", text: he.live.posted(shop(c.butcher_id), name), code: c.code });
    if (c.status === "sold_out" && c.sold_out_at) out.push({ id: `s-${c.id}`, at: c.sold_out_at, kind: "sold", text: he.live.sold(name, shop(c.butcher_id)), code: c.code });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
