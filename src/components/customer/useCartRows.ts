"use client";
// The cart's lines with their live cuts, prices and problems — shared by the cart and the checkout.
// Stock follows the shops live; what other customers hold at checkout right now shows as "לא זמין כרגע".
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCart, type CartLine } from "@/lib/cart";
import { canBuyWhole } from "@/lib/cut-helpers";
import { cartProblemText, type CartProblem } from "@/lib/errors";
import { he } from "@/lib/i18n/he";
import { useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { steaksOrderPrice, wholePrice } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, CutWithMedia } from "@/lib/types";

export interface Row {
  line: CartLine;
  cut: CutWithMedia | null;
  price: number;
  problem: string | null;
}
export interface ShopGroup {
  shop: Butcher | null;
  butcherId: string;
  rows: Row[];
}
type Held = { steaks_held: number; whole_held: boolean };

/** What is wrong with a line right now, from live stock and others' holds (null = can be bought). */
function lineProblem(line: CartLine, cut: CutWithMedia | null, held?: Held, server?: CartProblem): string | null {
  if (!cut || !["published", "sold_out"].includes(cut.status)) return he.errors.CUT_NOT_AVAILABLE;
  if (line.mode === "whole") {
    if (!canBuyWhole(cut)) return cut.status === "sold_out" ? he.errors.CUT_NOT_AVAILABLE : he.errors.WHOLE_NOT_AVAILABLE;
    if (held) return he.errors.CUT_RESERVED;
  } else {
    const qty = line.qty ?? 1;
    if (qty > cut.steaks_available) return he.errors.NOT_ENOUGH_STEAKS(cut.steaks_available);
    const free = held ? (held.whole_held ? 0 : cut.steaks_available - held.steaks_held) : cut.steaks_available;
    if (qty > free) return free <= 0 ? he.errors.CUT_RESERVED : he.errors.NOT_ENOUGH_STEAKS(free);
  }
  return server ? cartProblemText(server) : null;
}

function linePrice(line: CartLine, cut: CutWithMedia | null): number {
  if (!cut?.price_per_kg_agorot) return line.estAgorot;
  return line.mode === "whole"
    ? wholePrice(cut.weight_g ?? 0, cut.price_per_kg_agorot)
    : steaksOrderPrice(cut.steak_weight_g ?? 0, cut.price_per_kg_agorot, line.qty ?? 1);
}

export function useCartRows(serverProblems: CartProblem[] = []) {
  const lines = useCart();
  const butchers = useButchers();
  // live cuts for the lines in the cart, tagged with the cart they were loaded for (stale answers are ignored)
  const [loaded, setLoaded] = useState<{ ids: string; map: Map<string, CutWithMedia>; held: Map<string, Held> } | null>(null);
  const [error, setError] = useState(false);

  const ids = useMemo(() => lines.map((l) => l.cutId).sort().join(","), [lines]);
  const latestIds = useRef(ids);
  latestIds.current = ids;
  const load = useCallback(async () => {
    if (!ids) { setLoaded({ ids, map: new Map(), held: new Map() }); return; }
    const sb = supabaseBrowser();
    const list = ids.split(",");
    const [{ data, error }, holds] = await Promise.all([
      sb.from("cuts").select("*, cut_media(*)").in("id", list),
      sb.rpc("cut_holds", { p_ids: list }),
    ]);
    if (error) { setError(true); return; }
    setError(false);
    if (latestIds.current !== ids) return;          // the cart changed while this was loading
    setLoaded({
      ids,
      map: new Map(((data ?? []) as CutWithMedia[]).map((c) => [c.id, c])),
      held: new Map(((holds.data ?? []) as (Held & { cut_id: string })[]).map((h) => [h.cut_id, h])),
    });
  }, [ids]);
  const cuts = loaded?.ids === ids ? loaded.map : null;
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("cart-cuts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cuts" }, (p) => {
        const row = p.new as CutWithMedia;
        setLoaded((cur) => (cur?.map.has(row.id)
          ? { ...cur, map: new Map(cur.map).set(row.id, { ...cur.map.get(row.id)!, ...row }) } : cur));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const rows: Row[] = lines.map((line) => {
    const cut = cuts?.get(line.cutId) ?? null;
    const server = serverProblems.find((p) => p.cut_id === line.cutId);
    return { line, cut, price: linePrice(line, cut), problem: cuts ? lineProblem(line, cut, loaded?.held.get(line.cutId), server) : null };
  });
  const groups = groupByShop(rows, butchers);
  const total = rows.filter((r) => !r.problem).reduce((s, r) => s + r.price, 0);
  const blocked = rows.some((r) => r.problem);
  return { lines, cuts, error, load, rows, groups, total, blocked };
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
