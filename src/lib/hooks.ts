"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabaseBrowser } from "./supabase/client";
import type { Breed, Butcher, Profile } from "./types";

// ── small module caches (data rarely changes during a session) ──
let breedsCache: Breed[] | null = null;
let butchersCache: Butcher[] | null = null;

export function useBreeds(): Breed[] {
  const [breeds, setBreeds] = useState<Breed[]>(breedsCache ?? []);
  useEffect(() => {
    if (breedsCache) { setBreeds(breedsCache); return; }
    supabaseBrowser().from("breeds").select("*").eq("active", true).order("sort_order")
      .then(({ data }) => {
        if (data) { breedsCache = data as Breed[]; setBreeds(breedsCache); }
      });
  }, []);
  return breeds;
}

export function useButchers(): Butcher[] {
  const [list, setList] = useState<Butcher[]>(butchersCache ?? []);
  useEffect(() => {
    // another screen may have filled the cache between this one's first render and now
    if (butchersCache) { setList(butchersCache); return; }
    supabaseBrowser().from("butchers").select("*").then(({ data }) => {
      if (data) { butchersCache = data as Butcher[]; setList(butchersCache); }
    });
  }, []);
  return list;
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    setUser(user);
    if (user) {
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      setProfile((data as Profile) ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { user, profile, loading, reload: load };
}

/** Never rely on Realtime alone: refetch when the tab becomes visible again / regains focus / network returns. */
export function useRefetchOnFocus(fn: () => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let last = 0;
    const run = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 1500) return;
      last = now;
      ref.current();
    };
    document.addEventListener("visibilitychange", run);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    return () => {
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
    };
  }, []);
}

/** localStorage wrapped in try/catch (private mode etc.) */
export const safeStorage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = window.localStorage.getItem(key);
      return v == null ? fallback : (JSON.parse(v) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
  },
};

/** re-render every `ms` (for "x minutes ago" labels) */
export function useNow(ms = 30000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}
