"use client";
// The live feed's rules (customer spec §4.3, §13) on top of the catalogue:
// - posts that go live while the customer is scrolling wait behind a "N new" pill instead of pushing the list
//   under their finger; posts already there update in place (stock, price);
// - personal sold-out: a cut that sells out is stamped "אזל" (and keeps its place) only for someone looking at it
//   now or who had stopped on it before and has not had the one-time notice; for everyone else it just leaves
//   their feed. A cut that comes off sale for another reason (withdrawn, back to draft) is never stamped.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rankFeed } from "@/lib/feed";
import { impressionOf, inView, soldOutFate } from "@/lib/impressions";
import { isAvailable } from "@/lib/market";
import type { CutWithMedia } from "@/lib/types";

export type FeedItem = { cut: CutWithMedia; gone: boolean };

export function useLiveFeed(cuts: CutWithMedia[] | null) {
  const available = useMemo(() => rankFeed((cuts ?? []).filter(isAvailable)), [cuts]);
  const sold = useMemo(() => new Map((cuts ?? []).filter((c) => !isAvailable(c) && c.status === "sold_out").map((c) => [c.id, c])), [cuts]);
  const [ids, setIds] = useState<string[] | null>(null);
  const last = useRef(new Map<string, CutWithMedia>());
  // the fate of each post that stopped being on sale, decided once — at the moment it happens, while the post is
  // still on screen (so "looked at right now" is known before it would unmount)
  const fate = useRef(new Map<string, "stamp" | "drop">());

  // what a fresh feed holds: everything on sale, and the sold cuts still owed their one-time notice
  const fresh = useCallback(() => {
    const owed = [...sold.values()].filter((c) => soldOutFate(impressionOf(c.id), false) === "stamp");
    fate.current = new Map(owed.map((c) => [c.id, "stamp"]));
    setIds(rankFeed([...available, ...owed]).map((c) => c.id));
  }, [available, sold]);

  useEffect(() => {
    if (cuts && ids === null) fresh();
  }, [cuts, ids, fresh]);

  const byId = useMemo(() => new Map(available.map((c) => [c.id, c])), [available]);
  const items: FeedItem[] = useMemo(() => (ids ?? []).flatMap((id): FeedItem[] => {
    const live = byId.get(id);
    if (live) {
      // back on sale (a cancelled order returned the meat): the stamp comes off
      last.current.set(id, live);
      fate.current.delete(id);
      return [{ cut: live, gone: false }];
    }
    let f = fate.current.get(id);
    if (!f) {
      // a withdrawal or a return to draft is not a sale: never stamped
      f = sold.has(id) ? soldOutFate(impressionOf(id), inView.has(id)) : "drop";
      fate.current.set(id, f);
    }
    if (f === "drop") return [];
    const cut = sold.get(id) ?? last.current.get(id);
    return cut ? [{ cut, gone: true }] : [];
  }), [ids, byId, sold]);

  const shown = useMemo(() => new Set(ids ?? []), [ids]);
  const pending = ids === null ? 0 : available.filter((c) => !shown.has(c.id)).length;

  /** take in the waiting posts and let the stamped ones go (the pill, pull-to-refresh) */
  const showNew = fresh;

  return { items, pending, showNew, ready: ids !== null };
}
