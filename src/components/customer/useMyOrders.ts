"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, Checkout, Cut, CutMedia, Order, OrderItem } from "@/lib/types";

export type ItemRow = OrderItem & {
  cuts: Pick<Cut, "code" | "cut_type" | "breed_key" | "breed_other" | "steak_weight_g"> & { cut_media: CutMedia[] };
};
export type ShopOrderRow = Order & {
  order_items: ItemRow[];
  butchers: Pick<Butcher, "name" | "address" | "pickup_hours" | "phone" | "slug" | "logo_path"> | null;
};
/** A purchase with its shop orders and their lines. */
export type CheckoutRow = Checkout & { orders: ShopOrderRow[] };

export const CHECKOUT_SELECT =
  "*, orders(*, butchers(name, address, pickup_hours, phone, slug, logo_path), order_items(*, cuts(code, cut_type, breed_key, breed_other, steak_weight_g, cut_media(*))))";

/** Shop orders in a stable order (by order number) and their lines (active first). */
export function normalizeCheckout(k: CheckoutRow): CheckoutRow {
  return {
    ...k,
    orders: [...k.orders].sort((a, b) => a.order_number - b.order_number).map((o) => ({
      ...o,
      order_items: [...o.order_items].sort((a, b) =>
        Number(a.status === "cancelled") - Number(b.status === "cancelled") || a.created_at.localeCompare(b.created_at)),
    })),
  };
}

/** Live: reloads when any of the customer's orders or order lines change. */
export function useMyOrdersRealtime(onChange: () => void) {
  const [uid, setUid] = useState<string | null>(null);
  useEffect(() => {
    supabaseBrowser().auth.getUser().then(({ data }) => setUid(data.user?.id ?? null));
  }, []);
  useEffect(() => {
    if (!uid) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`my-orders-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `customer_id=eq.${uid}` }, () => onChange())
      // order lines carry no customer id; RLS limits the events to this customer's own lines
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_items" }, () => onChange())
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [uid, onChange]);
}
