"use client";
// Visit-level events (spec §15): "app_open" once per visit, "auth_complete" after a sign-in (the sign-in route
// leaves a short-lived marker cookie), and where the customer came from for screens that report a source.
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/hooks";
import { isNewSession, track } from "@/lib/track";

let previous: string | null = null;
let current: string | null = null;
/** the screen the customer was on before this one: feed / search / shop / post / other */
export function cameFrom(): string {
  const p = previous ?? "";
  return p === "/" ? "feed" : p.startsWith("/search") ? "search" : p.startsWith("/b/") ? "shop" : p.startsWith("/cut/") ? "post" : p ? "other" : "direct";
}

export function Tracker() {
  const path = usePathname();
  const { user, loading } = useSession();
  if (path !== current) { previous = current; current = path; }

  useEffect(() => {
    if (loading) return;
    if (isNewSession()) track("app_open", { is_guest: !user, area_known: false });
    const m = document.cookie.match(/(?:^|; )solor_auth=([a-z]+)/);
    if (m) {
      document.cookie = "solor_auth=; max-age=0; path=/";
      track("auth_complete", { method: m[1] });
    }
  }, [loading, user]);
  return null;
}
