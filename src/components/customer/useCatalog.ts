"use client";
// Available cuts for the marketplace / a single shop. Reloads on realtime changes and on focus.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutWithMedia } from "@/lib/types";

export function useCatalog(shopId?: string | null, enabled = true) {
  const [cuts, setCuts] = useState<CutWithMedia[] | null>(null);
  const [error, setError] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const load = useCallback(async () => {
    if (!enabled) return;
    let q = supabaseBrowser().from("cuts").select("*, cut_media(*)").eq("status", "published");
    if (shopId) q = q.eq("butcher_id", shopId);
    const { data, error } = await q.order("published_at", { ascending: false }).limit(200);
    if (error) { setError(true); return; }
    setError(false);
    setCuts((data ?? []) as CutWithMedia[]);
  }, [shopId, enabled]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  useEffect(() => {
    if (!enabled) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`catalog-${shopId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cuts" }, (p) => {
        const row = p.new as { butcher_id?: string };
        if (shopId && row?.butcher_id && row.butcher_id !== shopId) return;
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(load, 400);
      })
      .subscribe();
    return () => { window.clearTimeout(timer.current); sb.removeChannel(ch); };
  }, [shopId, enabled, load]);

  return { cuts, error, reload: load };
}
