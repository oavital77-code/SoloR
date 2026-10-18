// What this device has seen of each cut (customer spec §13, FeedImpression): when a post first came into view, the
// longest it stayed in view, and whether the one-time "אזל" notice was already shown. Kept on the device, so it
// works for guests and for the shared demo account alike (how to identify a guest is still open, §18.6).
// The personal sold-out rule reads it: a cut that sold out is stamped once for someone who had stopped on it, and
// otherwise simply leaves their feed.
import { SOLD_OUT_DWELL_MS } from "./feed";

export interface Impression {
  /** first time in view (ms epoch) */
  f: number;
  /** longest continuous time in view (ms) */
  d: number;
  /** when the one-time sold-out notice was shown (ms epoch) */
  n?: number;
}
type Store = Record<string, Impression>;

const KEY = "solor.seen.v1";
const MAX = 400;
let cache: Store | null = null;
/** posts in view right now (cut ids), whatever screen they are on */
export const inView = new Set<string>();

function read(): Store {
  if (cache) return cache;
  try { cache = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Store; } catch { cache = {}; }
  return cache!;
}
function write(s: Store) {
  const ids = Object.keys(s);
  if (ids.length > MAX) ids.sort((a, b) => s[a].f - s[b].f).slice(0, ids.length - MAX).forEach((id) => delete s[id]);
  cache = s;
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked: keep in memory */ }
}

export function impressionOf(cutId: string): Impression | undefined {
  return read()[cutId];
}

/** A stretch of time a post was in view. */
export function recordView(cutId: string, ms: number, at = Date.now()) {
  const s = read();
  const cur = s[cutId];
  s[cutId] = { ...cur, f: cur?.f ?? at - ms, d: Math.max(cur?.d ?? 0, Math.round(ms)) };
  write(s);
}

export function markSoldNotice(cutId: string, at = Date.now()) {
  const s = read();
  s[cutId] = { ...(s[cutId] ?? { f: at, d: 0 }), n: s[cutId]?.n ?? at };
  write(s);
}

/**
 * A cut on someone's feed has sold out: stamp it (and keep it in place) or let it leave their feed.
 * Stamped when it is in front of their eyes right now (a post never vanishes silently while looked at, §4.3),
 * or when they had stopped on it before and have not had the one-time notice yet (§13).
 */
export function soldOutFate(imp: Impression | undefined, visibleNow: boolean): "stamp" | "drop" {
  if (visibleNow) return "stamp";
  return imp && imp.d >= SOLD_OUT_DWELL_MS && !imp.n ? "stamp" : "drop";
}

/** test hook */
export function resetImpressions() {
  cache = {};
  inView.clear();
}
