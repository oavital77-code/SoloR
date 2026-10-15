"use client";
// Reels — the butchering itself. Only cuts that have a video; a reel leads to the cut (details + order).
// Whole market by default; `?b=<slug>` scopes to one shop, `?c=<code>` opens on a given cut.
// The URL follows the reel on screen (`?c=`), so "back" from a cut returns to the same reel.
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ReelCard } from "@/components/customer/ReelCard";
import { useToast } from "@/components/Toast";
import { EmptyState, ErrorState, Spinner } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { cutTitle, videoOf } from "@/lib/cut-helpers";
import { shopPath } from "@/lib/market";
import { useBreeds, useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutWithMedia } from "@/lib/types";

const SELECT = "*, cut_media(*)";
const hasVideo = (c: CutWithMedia) => !!videoOf(c.cut_media);

export default function ReelsPage() {
  return <Suspense><Reels /></Suspense>;
}

function Reels() {
  const params = useSearchParams();
  const slug = params.get("b");
  const startCode = useRef(params.get("c"));
  const breeds = useBreeds();
  const butchers = useButchers();
  const shop = slug ? butchers.find((b) => b.slug === slug) ?? null : null;
  const shopId = shop?.id ?? null;
  const shopIdRef = useRef<string | null>(null);
  shopIdRef.current = shopId;
  const toast = useToast();
  const [cuts, setCuts] = useState<CutWithMedia[] | null>(null);
  const [error, setError] = useState(false);
  const [muted, setMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<string | null>(startCode.current);
  const breedsRef = useRef(breeds);
  breedsRef.current = breeds;
  const cutsRef = useRef(cuts);
  cutsRef.current = cuts;

  const load = useCallback(async () => {
    if (slug && !shopId) return; // wait until the shop is resolved
    let q = supabaseBrowser().from("cuts").select(SELECT).eq("status", "published");
    if (shopId) q = q.eq("butcher_id", shopId);
    const { data, error } = await q.order("published_at", { ascending: false }).limit(100);
    if (error) { setError(true); return; }
    setError(false);
    const list = ((data ?? []) as CutWithMedia[]).filter(hasVideo);
    // keep the reel being watched even if it sold out meanwhile (it shows grey)
    setCuts((prev) => {
      const cur = prev?.find((c) => c.code === currentRef.current);
      return cur && !list.some((c) => c.id === cur.id) ? [...list, cur] : list;
    });
  }, [slug, shopId]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  // open on ?c= once the list is in
  const positioned = useRef(false);
  useEffect(() => {
    if (!cuts || positioned.current) return;
    positioned.current = true;
    const code = startCode.current;
    if (!code) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-code="${CSS.escape(code)}"]`);
    if (el) scrollRef.current!.scrollTo({ top: el.offsetTop });
  }, [cuts]);

  const onVisible = useCallback((code: string) => {
    currentRef.current = code;
    const qs = new URLSearchParams(window.location.search);
    qs.set("c", code);
    window.history.replaceState(window.history.state, "", `/discover?${qs.toString()}`);
  }, []);

  const scrollTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), []);

  // realtime: new videos join the top; sold-out / withdrawn reels leave (except the one on screen)
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("reels-cuts")
      .on("postgres_changes", { event: "*", schema: "public", table: "cuts" }, async (payload) => {
        if (payload.eventType === "DELETE") return;
        const row = payload.new as Cut;
        if (shopIdRef.current && row.butcher_id !== shopIdRef.current) return;
        const watching = row.code === currentRef.current;

        if (row.status !== "published") {
          setCuts((cs) => {
            if (!cs) return cs;
            if (watching && row.status === "sold_out") return cs.map((c) => (c.id === row.id ? { ...c, ...row } : c));
            return cs.filter((c) => c.id !== row.id);
          });
          return;
        }
        if (cutsRef.current?.some((c) => c.id === row.id)) {
          setCuts((cs) => cs?.map((c) => (c.id === row.id ? { ...c, ...row } : c)) ?? cs);
          return;
        }
        const { data } = await sb.from("cuts").select(SELECT).eq("id", row.id).maybeSingle();
        const cut = data as CutWithMedia | null;
        if (!cut || !hasVideo(cut)) return;
        setCuts((cs) => (cs ? [cut, ...cs.filter((c) => c.id !== cut.id)] : [cut]));
        toast(he.reels.newVideo(cutTitle(cut, breedsRef.current)), { duration: 6000, action: { label: he.feed.show, onClick: scrollTop } });
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [toast, scrollTop]);

  const shopOf = useMemo(() => (id: string) => (shop ? null : butchers.find((b) => b.id === id)), [butchers, shop]);

  return (
    <main className="relative h-dvh bg-ink">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-ink/80 to-transparent px-5 pt-[max(0.9rem,env(safe-area-inset-top))] pb-8">
        <div className="pointer-events-auto flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-bold text-ivory">{he.reels.title}</h1>
            <p className="truncate text-xs tracking-wide text-ivory/60">{shop ? shop.name : he.reels.subtitle}</p>
          </div>
          {shop && (
            <Link href={shopPath(shop)} className="min-h-10 shrink-0 py-2.5 text-sm text-ivory/75">{he.market.backToShop}</Link>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="no-scrollbar h-full snap-y snap-mandatory overflow-y-auto">
        {error && !cuts ? (
          <div className="pt-28"><ErrorState dark onRetry={load} /></div>
        ) : !cuts ? (
          <div className="grid h-full place-items-center"><Spinner /></div>
        ) : cuts.length === 0 ? (
          <div className="grid h-full place-items-center px-8"><EmptyState text={he.reels.empty} /></div>
        ) : (
          cuts.map((c) => (
            <div key={c.id} className="h-full">
              <ReelCard cut={c} breeds={breeds} shop={shopOf(c.butcher_id)} muted={muted}
                onToggleMute={() => setMuted((m) => !m)} onVisible={onVisible} />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
