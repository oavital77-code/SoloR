// The cart lives on the device (localStorage): guests can fill it, and it survives moving between shops and
// signing in. Once signed in it is also kept on the account (table `carts`) and merged with what the account
// already had (customer spec §9.1), so it follows the customer to another device.
// Adding to the cart reserves nothing — stock is checked for the whole cart at checkout.
// One line per sale item; adding the same item again replaces its line (all of it / a slice, the grams).
import { useSyncExternalStore } from "react";
import { SLICE_MIN_G, SLICE_STEP_G } from "./items";
import type { LineMode } from "./types";

export interface CartLine {
  itemId: string;
  /** "SOL-523-1" */
  code: string;
  parentCode: number;
  butcherId: string;
  mode: LineMode;
  /** slices only: grams asked for and the thickness (optional) */
  grams: number | null;
  thicknessCm: number | null;
  /** price estimate when added, for the cart bar; the cart page shows live prices */
  estAgorot: number;
  addedAt: number;
}

export const CART_KEY = "solor.cart.v2";      // v1 held cut lines (before the butcher flow)
export const MAX_CART_LINES = 30;

// ── pure helpers (unit-tested) ──
export function upsertLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.itemId === line.itemId);
  if (i === -1) return [...lines, line].slice(-MAX_CART_LINES);
  const next = [...lines];
  next[i] = { ...line, addedAt: lines[i].addedAt };
  return next;
}

export function removeLine(lines: CartLine[], itemId: string): CartLine[] {
  return lines.filter((l) => l.itemId !== itemId);
}

/** This device's cart merged into the account's: every item from both; for an item in both, this device's line wins. */
export function mergeCarts(local: CartLine[], account: CartLine[]): CartLine[] {
  const merged = [...account];
  for (const l of local) {
    const i = merged.findIndex((a) => a.itemId === l.itemId);
    if (i === -1) merged.push(l); else merged[i] = l;
  }
  return merged.sort((a, b) => a.addedAt - b.addedAt).slice(-MAX_CART_LINES);
}

export function sanitizeCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CartLine[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const l = x as Partial<CartLine>;
    if (typeof l.itemId !== "string" || seen.has(l.itemId)) continue;
    if (l.mode !== "unit" && l.mode !== "remainder_all" && l.mode !== "remainder_slice") continue;
    const slice = l.mode === "remainder_slice";
    const grams = slice ? Math.max(SLICE_MIN_G, Math.round((Number(l.grams) || 0) / SLICE_STEP_G) * SLICE_STEP_G) : null;
    const thick = slice && Number(l.thicknessCm) >= 1 && Number(l.thicknessCm) <= 8 ? Number(l.thicknessCm) : null;
    seen.add(l.itemId);
    out.push({
      itemId: l.itemId, code: String(l.code ?? ""), parentCode: Number(l.parentCode) || 0, butcherId: String(l.butcherId ?? ""),
      mode: l.mode, grams, thicknessCm: thick,
      estAgorot: Math.max(0, Math.round(Number(l.estAgorot) || 0)), addedAt: Number(l.addedAt) || 0,
    });
  }
  return out.slice(-MAX_CART_LINES);
}

// ── store ──
let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  if (cache) return cache;
  try {
    cache = sanitizeCart(JSON.parse(window.localStorage.getItem(CART_KEY) ?? "[]"));
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try { window.localStorage.setItem(CART_KEY, JSON.stringify(lines)); } catch { /* private mode: memory only */ }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => { if (e.key === CART_KEY) { cache = null; fn(); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(fn); window.removeEventListener("storage", onStorage); };
}

const EMPTY: CartLine[] = [];

export const cart = {
  get: () => (typeof window === "undefined" ? EMPTY : read()),
  put: (line: Omit<CartLine, "addedAt">) => write(upsertLine(read(), { ...line, addedAt: Date.now() })),
  remove: (itemId: string) => write(removeLine(read(), itemId)),
  /** a slice's grams (in steps, from the minimum) */
  setGrams: (itemId: string, grams: number) =>
    write(read().map((l) => (l.itemId === itemId && l.mode === "remainder_slice" ? { ...l, grams: Math.max(SLICE_MIN_G, grams) } : l))),
  clear: () => write([]),
  /** replace the whole cart (merging with the account) */
  replace: (lines: CartLine[]) => write(lines),
  subscribe,
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, cart.get, () => EMPTY);
}
