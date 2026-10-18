"use client";
// What other customers hold at checkout right now, for the cuts on screen (§13 "שוריין"). Holds are not on
// realtime, so they are polled at the live-update pace and on focus; a held post can come back by itself.
import { useCallback, useEffect, useMemo, useState } from "react";
import { LIVE_UPDATE_MS, type Held } from "@/lib/feed";
import { useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";

export function useHeldCuts(ids: string[]): Map<string, Held> {
  const key = useMemo(() => [...ids].sort().slice(0, 60).join(","), [ids]);
  const [held, setHeld] = useState<Map<string, Held>>(new Map());

  const load = useCallback(async () => {
    if (!key) { setHeld(new Map()); return; }
    const { data, error } = await supabaseBrowser().rpc("cut_holds", { p_ids: key.split(",") });
    if (error) return;                       // keep the last answer; the server still refuses held cuts
    setHeld(new Map(((data ?? []) as (Held & { cut_id: string })[]).map((h) => [h.cut_id, h])));
  }, [key]);

  useEffect(() => {
    load();
    const t = window.setInterval(load, LIVE_UPDATE_MS);
    return () => window.clearInterval(t);
  }, [load]);
  useRefetchOnFocus(load);
  return held;
}
