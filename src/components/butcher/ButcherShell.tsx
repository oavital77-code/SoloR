"use client";
// Butcher-wide context: shop, live order notifications (sound + counter + document.title).
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "../Toast";
import { Spinner } from "../ui";
import { he } from "@/lib/i18n/he";
import { safeStorage, useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, Order, Profile } from "@/lib/types";

interface ButcherCtx {
  profile: Profile;
  butcher: Butcher;
  newOrders: number;
  /** increments on every order change — screens refetch on it */
  ordersVersion: number;
  sound: boolean;
  setSound: (on: boolean) => void;
}

const Ctx = createContext<ButcherCtx | null>(null);
export const useButcher = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useButcher outside ButcherShell");
  return v;
};

const SOUND_KEY = "solor.butcher.sound";

export function ButcherShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [butcher, setButcher] = useState<Butcher | null>(null);
  const [newOrders, setNewOrders] = useState(0);
  const [ordersVersion, setOrdersVersion] = useState(0);
  const [sound, setSoundState] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);

  // load profile + shop
  useEffect(() => {
    (async () => {
      const sb = supabaseBrowser();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return router.replace("/login");
      const { data: p } = await sb.from("profiles").select("*").eq("id", user.id).single();
      if (!p || p.role !== "butcher" || !p.butcher_id) return router.replace("/");
      const { data: b } = await sb.from("butchers").select("*").eq("id", p.butcher_id).single();
      setProfile(p as Profile);
      setButcher(b as Butcher);
    })();
  }, [router]);

  const beep = useCallback(() => {
    const ac = audioRef.current;
    if (!ac || !soundRef.current) return;
    if (ac.state === "suspended") ac.resume().catch(() => {});
    const t = ac.currentTime;
    [0, 0.18].forEach((offset, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = i === 0 ? 880 : 1320;
      g.gain.setValueAtTime(0.0001, t + offset);
      g.gain.exponentialRampToValueAtTime(0.35, t + offset + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.16);
      o.connect(g).connect(ac.destination);
      o.start(t + offset);
      o.stop(t + offset + 0.18);
    });
  }, []);

  // sound needs a user gesture to unlock — the toggle itself is that gesture
  const setSound = useCallback((on: boolean) => {
    soundRef.current = on;
    setSoundState(on);
    safeStorage.set(SOUND_KEY, on);
    if (on) {
      if (!audioRef.current) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        audioRef.current = new AC();
      }
      audioRef.current.resume().catch(() => {});
      beep();
    }
  }, [beep]);

  // remember the preference, but audio can only start after a tap: unlock on first interaction
  useEffect(() => {
    if (!safeStorage.get(SOUND_KEY, false)) return;
    const unlock = () => { setSound(true); window.removeEventListener("pointerdown", unlock); };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [setSound]);

  const countNew = useCallback(async (bid: string) => {
    const { count } = await supabaseBrowser().from("orders").select("id", { count: "exact", head: true })
      .eq("butcher_id", bid).eq("status", "new");
    setNewOrders(count ?? 0);
  }, []);

  // realtime: orders of this shop
  useEffect(() => {
    if (!butcher) return;
    countNew(butcher.id);
    const sb = supabaseBrowser();
    const ch = sb.channel(`butcher-orders-${butcher.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `butcher_id=eq.${butcher.id}` },
        (payload) => {
          setOrdersVersion((v) => v + 1);
          countNew(butcher.id);
          if (payload.eventType === "INSERT") {
            const o = payload.new as Order;
            beep();
            toast(`🔔 הזמנה חדשה #${o.order_number}`, {
              tone: "live", duration: 8000,
              action: { label: he.feed.show, onClick: () => router.push(`/butcher/orders/${o.id}`) },
            });
          }
        })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [butcher, beep, countNew, toast, router]);

  useRefetchOnFocus(() => {
    if (!butcher) return;
    countNew(butcher.id);
    setOrdersVersion((v) => v + 1);
  });

  useEffect(() => {
    document.title = newOrders > 0 ? `(${newOrders}) SoloR — הזמנות חדשות` : "SoloR — קצב";
  }, [newOrders]);

  if (!profile || !butcher) {
    return <div className="grid min-h-dvh place-items-center bg-neutral-50 text-neutral-500"><Spinner /></div>;
  }

  return (
    <Ctx.Provider value={{ profile, butcher, newOrders, ordersVersion, sound, setSound }}>
      {children}
    </Ctx.Provider>
  );
}
