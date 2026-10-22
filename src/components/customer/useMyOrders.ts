"use client";
import { useEffect, useState } from "react";
import { he } from "@/lib/i18n/he";
import { clipNo } from "@/lib/items";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, Checkout, CutMedia, Item, Order, OrderItem, Parent } from "@/lib/types";

/** An order line with the item it bought (its label, steaks, photos) and that item's parent cut. */
export type ItemRow = OrderItem & {
  items: (Pick<Item, "id" | "parent_id" | "label" | "kind" | "steak_count"> & {
    cut_media: CutMedia[];
    parent: (Pick<Parent, "code" | "cut_type" | "breed_key" | "breed_other"> & { cut_media?: CutMedia[] }) | null;
  }) | null;
};
export type ShopOrderRow = Order & {
  order_items: ItemRow[];
  butchers: Pick<Butcher, "name" | "address" | "pickup_hours" | "phone" | "slug" | "logo_path"> | null;
};
/** A purchase with its shop orders and their lines. */
export type CheckoutRow = Checkout & { orders: ShopOrderRow[] };

export const CHECKOUT_SELECT =
  "*, orders(*, butchers(name, address, pickup_hours, phone, slug, logo_path), order_items(*, items(id, parent_id, label, kind, steak_count, cut_media(*), parent:parents(code, cut_type, breed_key, breed_other, cut_media(*)))))";

/** The same line embedding, for the shop's own orders. */
export const ORDER_ITEMS_EMBED = "order_items(*, items(id, parent_id, label, kind, steak_count, cut_media(*), parent:parents(code, cut_type, breed_key, breed_other, cut_media(*))))";

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

// ── what an order line shows: its parent cut, the item's code and photos ──
const NO_CUT = { cut_type: null, breed_key: null, breed_other: null } as const;
export const lineCut = (i: ItemRow) => i.items?.parent ?? NO_CUT;
export const lineCode = (i: ItemRow) => (i.items ? `SOL-${i.items.label}` : "");
// the block has no photos of its own: the parent's
export const lineMedia = (i: ItemRow): CutMedia[] => (i.items?.cut_media?.length ? i.items.cut_media : i.items?.parent?.cut_media ?? []);
// the cut a line was taken of (the cart and the orders group by it): its id, its own photos, "נתח 09"
export const lineParentId = (i: ItemRow) => i.items?.parent_id ?? i.item_id ?? i.id;
export const lineParentMedia = (i: ItemRow): CutMedia[] => (i.items?.parent?.cut_media?.length ? i.items.parent.cut_media : lineMedia(i));
export const lineCutNo = (i: ItemRow) => he.flow.cutNo(clipNo(i.items?.parent?.code ?? ""));
export const lineParentHref = (i: ItemRow) => (i.items ? `/cut/${i.items.parent_id}` : "/");
export const lineHref = (i: ItemRow) => (i.items ? `/cut/${i.items.parent_id}#i-${i.items.label}` : "/");
