// Pilot measurement (customer spec §15): events go into a small queue and are sent in batches (every few seconds,
// and when the page is hidden — with keepalive, so the last ones are not lost). Measuring never gets in the way:
// any failure is dropped silently. Personal details are never sent; the server adds the account itself.
import { supabaseBrowser } from "./supabase/client";

export type EventName =
  | "app_open" | "post_impression" | "media_swipe" | "video_play" | "new_posts_pill_click" | "butcher_page_view"
  | "search_submit" | "search_result_click" | "add_to_cart" | "cart_view" | "checkout_start" | "auth_complete"
  | "reservation_failed" | "payment_success" | "payment_failed";

type Props = Record<string, string | number | boolean | null | undefined | string[]>;
interface Queued { name: EventName; viewer: string; session: string; props: Props }

const VIEWER_KEY = "solor.viewer";
const SESSION_KEY = "solor.session";
const SESSION_IDLE_MS = 30 * 60e3;
const FLUSH_MS = 5000;
const queue: Queued[] = [];
let timer: number | undefined;
let hooked = false;
/** the page is being hidden or left: anything tracked now is sent at once (posts report their last view here) */
let leaving = false;
/** the signed-in token, kept at hand: when the page is leaving there is no time to ask for it */
let token: string | null = null;

function stored(storage: () => Storage, key: string, make: () => string): string {
  try {
    const s = storage();
    const v = s.getItem(key) ?? make();
    s.setItem(key, v);
    return v;
  } catch {
    return make();
  }
}
const newId = () => crypto.randomUUID();

/** this device (guests too) */
export const viewerId = () => stored(() => window.localStorage, VIEWER_KEY, newId);

/** this visit: a new one after 30 minutes without any event */
export function sessionId(now = Date.now()): string {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const cur = raw ? (JSON.parse(raw) as { id: string; last: number }) : null;
    const id = cur && now - cur.last < SESSION_IDLE_MS ? cur.id : newId();
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    return stored(() => window.sessionStorage, SESSION_KEY, newId);
  }
}

/** a fresh visit starts with this call (true when it is the first event of a new session) */
export function isNewSession(now = Date.now()): boolean {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    const cur = raw ? (JSON.parse(raw) as { last: number }) : null;
    return !cur || now - cur.last >= SESSION_IDLE_MS;
  } catch {
    return true;
  }
}

export function track(name: EventName, props: Props = {}) {
  if (typeof window === "undefined") return;
  const clean = Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
  queue.push({ name, viewer: viewerId(), session: sessionId(), props: clean as Props });
  if (!hooked) {
    hooked = true;
    const sb = supabaseBrowser();
    sb.auth.getSession().then(({ data }) => { token = data.session?.access_token ?? null; }, () => {});
    sb.auth.onAuthStateChange((_e, session) => { token = session?.access_token ?? null; });
    window.addEventListener("pagehide", () => { leaving = true; flush(true); });
    window.addEventListener("pageshow", () => { leaving = false; });
    document.addEventListener("visibilitychange", () => {
      leaving = document.visibilityState === "hidden";
      if (leaving) flush(true);
    });
  }
  if (leaving) flush(true);
  else if (queue.length >= 40) flush();
  else if (timer === undefined) timer = window.setTimeout(() => flush(), FLUSH_MS);
}

function flush(leaving = false) {
  window.clearTimeout(timer);
  timer = undefined;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  if (leaving) {
    // the page may be gone before a normal request finishes
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    fetch(`${url}/rest/v1/rpc/log_events`, {
      method: "POST", keepalive: true,
      headers: { "content-type": "application/json", apikey: key, authorization: `Bearer ${token ?? key}` },
      body: JSON.stringify({ p_events: batch }),
    }).catch(() => {});
  } else {
    supabaseBrowser().rpc("log_events", { p_events: batch }).then(() => {}, () => {});
  }
  if (queue.length) timer = window.setTimeout(() => flush(), FLUSH_MS);
}
