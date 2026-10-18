"use client";
// The live feed's rules (customer spec §4.3) on top of the catalogue: posts that go live while the customer is
// scrolling wait behind a "N new" pill instead of pushing the list under their finger; posts already on screen
// update in place (stock, price); a post that sells out or comes off sale stays where it was with the "אזל" stamp
// until the next refresh, rather than vanishing.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { rankFeed } from "@/lib/feed";
import { isAvailable } from "@/lib/market";
import type { CutWithMedia } from "@/lib/types";

export type FeedItem = { cut: CutWithMedia; gone: boolean };

export function useLiveFeed(cuts: CutWithMedia[] | null) {
  const available = useMemo(() => rankFeed((cuts ?? []).filter(isAvailable)), [cuts]);
  const [ids, setIds] = useState<string[] | null>(null);
  const seen = useRef(new Map<string, CutWithMedia>());

  // the first load fills the feed; later loads only refresh what is already there
  useEffect(() => {
    if (cuts && ids === null) setIds(available.map((c) => c.id));
  }, [cuts, ids, available]);

  const byId = useMemo(() => new Map(available.map((c) => [c.id, c])), [available]);
  const items: FeedItem[] = useMemo(() => (ids ?? []).flatMap((id): FeedItem[] => {
    const live = byId.get(id);
    if (live) { seen.current.set(id, live); return [{ cut: live, gone: false }]; }
    const last = seen.current.get(id);
    return last ? [{ cut: last, gone: true }] : [];
  }), [ids, byId]);

  const shown = useMemo(() => new Set(ids ?? []), [ids]);
  const pending = ids === null ? 0 : available.filter((c) => !shown.has(c.id)).length;

  /** take in the waiting posts and drop the sold ones (the pill, pull-to-refresh) */
  const showNew = useCallback(() => setIds(available.map((c) => c.id)), [available]);

  return { items, pending, showNew, ready: ids !== null };
}
