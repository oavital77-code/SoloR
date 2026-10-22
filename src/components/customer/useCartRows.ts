"use client";
// The cart's lines with their live items, prices and problems — shared by the cart and the checkout.
// Stock follows the shops live; what other customers hold at checkout right now shows as "לא זמין כרגע".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart, type CartLine } from "@/lib/cart";
import { cartProblemText, type CartProblem } from "@/lib/errors";
import { he } from "@/lib/i18n/he";
import { useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { freeG, isAvailable, linePrice, SALE_ITEM_SELECT, SLICE_MIN_G, sliceCapG, toSaleItems, type Held, type ItemRow } from "@/lib/items";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, SaleItem } from "@/lib/types";
import { loadHolds } from "./useHeldItems";

export interface Row {
  line: CartLine;
  cut: SaleItem | null;
  price: number;
  problem: string | null;
}
export interface ShopGroup {
  shop: Butcher | null;
  butcherId: string;
  rows: Row[];
}

/** What is wrong with a line right now, from live stock and others' holds (null = can be bought). */
function lineProblem(line: CartLine, item: SaleItem | null, held?: Held, server?: CartProblem): string | null {
  if (!item || !isAvailable(item)) return he.errors.ITEM_NOT_AVAILABLE;
  if (line.mode !== "remainder_slice") {
    if (held) return he.errors.ITEM_RESERVED;
  } else {
    if (held?.whole_held) return he.errors.ITEM_RESERVED;
    const cap = sliceCapG(freeG(item, held));
    if ((line.grams ?? 0) > cap) return cap < SLICE_MIN_G && held ? he.errors.ITEM_RESERVED : he.errors.NOT_ENOUGH_WEIGHT(cap);
  }
  return server ? cartProblemText(server) : null;
}

export function useCartRows(serverProblems: CartProblem[] = []) {
  const lines = useCart();
  const butchers = useButchers();
  // live items for the lines in the cart, tagged with the cart they were loaded for (stale answers are ignored)
  const [loaded, setLoaded] = useState<{ ids: string; map: Map<string, SaleItem>; held: Map<string, Held> } | null>(null);
  const [error, setError] = useState(false);

  const ids = useMemo(() => lines.map((l) => l.itemId).sort().join(","), [lines]);
  const latestIds = useRef(ids);
  latestIds.current = ids;
  const load = useCallback(async () => {
    if (!ids) { setLoaded({ ids, map: new Map(), held: new Map() }); return; }
    const list = ids.split(",");
    const [{ data, error }, held] = await Promise.all([
      supabaseBrowser().from("items").select(SALE_ITEM_SELECT).in("id", list),
      loadHolds(list),
    ]);
    if (error) { setError(true); return; }
    setError(false);
    if (latestIds.current !== ids) return;          // the cart changed while this was loading
    setLoaded({ ids, map: new Map(toSaleItems(data as ItemRow[]).map((c) => [c.id, c])), held: held ?? new Map() });
  }, [ids]);
  const items = loaded?.ids === ids ? loaded.map : null;
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("cart-items")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "items" }, (p) => {
        const row = p.new as SaleItem;
        setLoaded((cur) => (cur?.map.has(row.id)
          ? { ...cur, map: new Map(cur.map).set(row.id, { ...cur.map.get(row.id)!, status: row.status, weight_g: row.weight_g, sold_out_at: row.sold_out_at }) }
          : cur));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const rows: Row[] = lines.map((line) => {
    const cut = items?.get(line.itemId) ?? null;
    const server = serverProblems.find((p) => p.item_id === line.itemId);
    return {
      line, cut,
      price: cut ? linePrice(cut, line.mode, line.grams) : line.estAgorot,
      problem: items ? lineProblem(line, cut, loaded?.held.get(line.itemId), server) : null,
    };
  });
  const groups = groupByShop(rows, butchers);
  const total = rows.filter((r) => !r.problem).reduce((s, r) => s + r.price, 0);
  const blocked = rows.some((r) => r.problem);
  return { lines, cuts: items, held: loaded?.held ?? new Map<string, Held>(), error, load, rows, groups, total, blocked };
}

function groupByShop(rows: Row[], butchers: Butcher[]): ShopGroup[] {
  const order: string[] = [];
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    const bid = r.cut?.butcher_id ?? r.line.butcherId;
    if (!by.has(bid)) { by.set(bid, []); order.push(bid); }
    by.get(bid)!.push(r);
  }
  return order.map((bid) => ({ shop: butchers.find((b) => b.id === bid) ?? null, butcherId: bid, rows: by.get(bid)! }));
}
