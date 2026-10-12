"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutMedia, Order } from "@/lib/types";

export type MyOrderRow = Order & {
  cuts: Pick<Cut, "code" | "cut_type" | "breed_key" | "breed_other" | "steak_weight_g"> & { cut_media: CutMedia[] };
};
export const MY_ORDER_SELECT = "*, cuts(code, cut_type, breed_key, breed_other, steak_weight_g, cut_media(*))";


/** Subscribes to the signed-in customer's orders; calls onChange for every insert/update. */
export function useMyOrdersRealtime(onChange: (o: Order) => void) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  useEffect(() => {
    if (!uid) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`my-orders-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${uid}` },
        (p) => p.new && "id" in p.new && onChange(p.new as Order))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid, onChange]);
}
