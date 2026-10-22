"use client";
// What other customers hold at checkout right now, for the items on screen (§13 "שוריין"). Holds are not on
// realtime, so they are polled at the live-update pace and on focus; a held post can come back by itself.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LIVE_UPDATE_MS } from "@/lib/feed";
import { useRefetchOnFocus } from "@/lib/hooks";
import type { Held } from "@/lib/items";
import { supabaseBrowser } from "@/lib/supabase/client";

export async function loadHolds(ids: string[]): Promise<Map<string, Held> | null> {
  if (!ids.length) return new Map();
  const { data, error } = await supabaseBrowser().rpc("item_holds", { p_ids: ids.slice(0, 80) });
  if (error) return null;
  return new Map(((data ?? []) as (Held & { item_id: string })[]).map((h) => [h.item_id, { held_g: h.held_g, whole_held: h.whole_held }]));
}

export function useHeldItems(ids: string[]): Map<string, Held> {
  const key = useMemo(() => [...ids].sort().slice(0, 80).join(","), [ids]);
  const [held, setHeld] = useState<Map<string, Held>>(new Map());

  const load = useCallback(async () => {
    const m = await loadHolds(key ? key.split(",") : []);
    if (m) setHeld(m);                       // on error keep the last answer; the server still refuses held items
  }, [key]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, LIVE_UPDATE_MS);
    return () => window.clearInterval(t);
  }, [load]);
  useRefetchOnFocus(load);
  return held;
}
