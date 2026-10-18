// The cart lives on the device (localStorage): guests can fill it, and it survives moving between shops and
// signing in. Once signed in it is also kept on the account (table `carts`) and merged with what the account
// already had (customer spec §9.1), so it follows the customer to another device.
// Adding to the cart reserves nothing — stock is checked for the whole cart at checkout.
// One line per cut; adding the same cut again replaces its line (mode / quantity).
import { useSyncExternalStore } from "react";
import type { OrderMode } from "./types";

export interface CartLine {
  cutId: string;
  code: string;
  butcherId: string;
  mode: OrderMode;
  /** steaks only */
  qty: number | null;
  /** price estimate when added, for the cart bar; the cart page shows live prices */
  estAgorot: number;
  addedAt: number;
}

export const CART_KEY = "solor.cart.v1";
export const MAX_CART_LINES = 30;

// ── pure helpers (unit-tested) ──
export function upsertLine(lines: CartLine[], line: CartLine): CartLine[] {
  const i = lines.findIndex((l) => l.cutId === line.cutId);
  if (i === -1) return [...lines, line].slice(-MAX_CART_LINES);
  const next = [...lines];
  next[i] = { ...line, addedAt: lines[i].addedAt };
  return next;
}

export function removeLine(lines: CartLine[], cutId: string): CartLine[] {
  return lines.filter((l) => l.cutId !== cutId);
}

/** This device's cart merged into the account's: every cut from both; for a cut in both, this device's line wins. */
export function mergeCarts(local: CartLine[], account: CartLine[]): CartLine[] {
  const merged = [...account];
  for (const l of local) {
    const i = merged.findIndex((a) => a.cutId === l.cutId);
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
    if (typeof l.cutId !== "string" || seen.has(l.cutId)) continue;
    if (l.mode !== "whole" && l.mode !== "steaks") continue;
    const qty = l.mode === "steaks" ? Math.max(1, Math.floor(Number(l.qty) || 1)) : null;
    seen.add(l.cutId);
    out.push({
      cutId: l.cutId, code: String(l.code ?? ""), butcherId: String(l.butcherId ?? ""), mode: l.mode, qty,
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
  remove: (cutId: string) => write(removeLine(read(), cutId)),
  setQty: (cutId: string, qty: number) =>
    write(read().map((l) => (l.cutId === cutId && l.mode === "steaks" ? { ...l, qty: Math.max(1, qty) } : l))),
  clear: () => write([]),
  /** replace the whole cart (merging with the account) */
  replace: (lines: CartLine[]) => write(lines),
  subscribe,
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, cart.get, () => EMPTY);
}
