"use client";
// One parent cut with its own photos, its items and theirs, for the butcher's flow screens; follows changes live and on focus.
import { useCallback, useEffect, useState } from "react";
import { useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutMedia, Item, Parent } from "@/lib/types";

export type FlowItem = Item & { cut_media: CutMedia[] };

export function useParent(id: string | null) {
  const [parent, setParent] = useState<Parent | null>(null);
  const [media, setMedia] = useState<CutMedia[]>([]);
  const [items, setItems] = useState<FlowItem[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  const load = useCallback(async () => {
    if (!id) return;
    const sb = supabaseBrowser();
    const [{ data: p, error }, { data: rows, error: e2 }] = await Promise.all([
      sb.from("parents").select("*, cut_media(*)").eq("id", id).maybeSingle(),
      sb.from("items").select("*, cut_media(*)").eq("parent_id", id).order("unit_no", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true }),
    ]);
    if (error || e2) return setState("error");
    if (!p) return setState("notfound");
    const { cut_media, ...row } = p as Parent & { cut_media: CutMedia[] };
    setParent(row as Parent);
    setMedia(cut_media ?? []);
    setItems((rows ?? []) as FlowItem[]);
    setState("ok");
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);
  useEffect(() => {
    if (!id) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`flow-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `parent_id=eq.${id}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parents", filter: `id=eq.${id}` }, () => load())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id, load]);

  return { parent, media, items, state, reload: load, setParent };
}

/** One item (S5/S6) with its parent. */
export function useItem(id: string) {
  const [item, setItem] = useState<FlowItem | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("items").select("*, cut_media(*)").eq("id", id).maybeSingle();
    if (error) return setState("error");
    if (!data) return setState("notfound");
    setItem(data as FlowItem);
    setState("ok");
  }, [id]);
  useEffect(() => { load(); }, [load]);
  const flow = useParent(item?.parent_id ?? null);
  return { item, state: state === "ok" && flow.state !== "ok" ? flow.state : state, parent: flow.parent, parentMedia: flow.media, siblings: flow.items,
    reload: async () => { await Promise.all([load(), flow.reload()]); } };
}
