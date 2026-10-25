"use client";
// The cart held from the first cut put in it (founders 26.10.2026): while a signed-in customer's cart has cuts in it,
// they are held for them for ten minutes from the first one (hold_cart, migration 0021) and others see them as
// "שוריין"; the cart bar counts the time down. Every change of the cart is sent again (the clock keeps running);
// when it runs out the cuts stay in the cart, no longer held, until the next change or "שריין שוב". A guest's cart
// is held once they sign in. The checkout carries on with the same clock.
import { useSyncExternalStore } from "react";
import { cart, type CartLine } from "./cart";
import { supabaseBrowser } from "./supabase/client";

export interface CartHold {
  /** when the hold ends (ms), while one is running */
  expiresAt: number | null;
  /** held · ran out · a guest (signs in to hold) · nothing in the cart · not reached (offline, error) */
  status: "held" | "expired" | "guest" | "empty" | "off";
  /** cart lines someone else holds or that are gone, by item id */
  taken: string[];
}

const DEVICE_KEY = "bp.device";
let state: CartHold = { expiresAt: null, status: "empty", taken: [] };
const listeners = new Set<() => void>();
const set = (s: CartHold) => { state = s; listeners.forEach((l) => l()); };

function device(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) { id = crypto.randomUUID(); window.localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return "00000000-0000-4000-8000-000000000000";
  }
}

export const toHoldItems = (lines: CartLine[]) => lines.map((l) => ({
  item_id: l.itemId, mode: l.mode,
  requested_g: l.mode === "remainder_slice" ? l.grams : null,
  thickness_cm: l.mode === "remainder_slice" ? l.thicknessCm : null,
}));

let seq = 0;
/** sends the cart as it is now; `signedIn` false keeps it a guest's (nothing held) */
export async function syncCartHold(signedIn: boolean) {
  const lines = cart.get();
  const mine = ++seq;
  if (!lines.length && state.status !== "held") return set({ expiresAt: null, status: "empty", taken: [] });
  if (!signedIn) return set({ expiresAt: null, status: lines.length ? "guest" : "empty", taken: [] });
  const { data, error } = await supabaseBrowser().rpc("hold_cart", { p_items: toHoldItems(lines), p_device: device() });
  if (mine !== seq) return;   // a newer change went out meanwhile
  if (error || !data) return set({ expiresAt: null, status: lines.length ? "off" : "empty", taken: [] });
  const r = data as { expires_at: string | null; problems: { item_id: string }[] };
  const expiresAt = r.expires_at ? Date.parse(r.expires_at) : null;
  set({
    expiresAt, taken: (r.problems ?? []).map((p) => p.item_id),
    status: !lines.length ? "empty" : expiresAt && expiresAt > Date.now() ? "held" : "off",
  });
}

/** the clock ran out (called by whoever shows it) */
export function markHoldExpired() {
  if (state.status === "held") set({ ...state, status: "expired" });
}

export function useCartHold(): CartHold {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => state);
}
