"use client";
// C4 — cut page with live stock and the purchase bar. Choosing a cut adds it to the cart (stage 2);
// the order itself is confirmed from the cart, for everything in it at once.
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutDetail } from "@/components/CutDetail";
import { PurchaseBar } from "@/components/PurchaseBar";
import { ErrorState, Spinner } from "@/components/ui";
import { IconBack } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { track } from "@/lib/track";
import { cart, useCart } from "@/lib/cart";
import { cutTitle } from "@/lib/cut-helpers";
import { useBreeds, useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { shopPath } from "@/lib/market";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutMedia, OrderMode } from "@/lib/types";

const overlayBtn = "pointer-events-auto grid size-11 place-items-center rounded-full bg-scrim text-ivory";

export default function CutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const breeds = useBreeds();
  const butchers = useButchers();
  const toast = useToast();
  const [cut, setCut] = useState<Cut | null>(null);
  const [media, setMedia] = useState<CutMedia[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const router = useRouter();
  const lines = useCart();
  const inCart = cut ? lines.find((l) => l.cutId === cut.id) : undefined;

  const addToCart = useCallback((mode: OrderMode, qty: number | null, total: number) => {
    if (!cut) return;
    cart.put({ cutId: cut.id, code: cut.code, butcherId: cut.butcher_id, mode, qty, estAgorot: total });
    track("add_to_cart", { cut_id: cut.id, mode, qty, source: "post", price: total });
    toast(inCart ? he.cart.updated : he.cart.added, {
      tone: "success", duration: 5000, action: { label: he.cart.toCart, onClick: () => router.push("/cart") },
    });
  }, [cut, inCart, toast, router]);

  const load = useCallback(async () => {
    const { data, error } = await supabaseBrowser().from("cuts").select("*, cut_media(*)").eq("code", decodeURIComponent(code)).maybeSingle();
    if (error) return setState("error");
    if (!data) return setState("notfound");
    const { cut_media, ...rest } = data as Cut & { cut_media: CutMedia[] };
    setCut(rest);
    setMedia(cut_media);
    setState("ok");
  }, [code]);

  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  // live stock for this cut
  const cutId = cut?.id;
  useEffect(() => {
    if (!cutId) return;
    const sb = supabaseBrowser();
    const ch = sb.channel(`cut-${cutId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cuts", filter: `id=eq.${cutId}` },
        (p) => setCut((c) => (c ? { ...c, ...(p.new as Cut) } : c)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [cutId]);

  const butcher = butchers.find((b) => b.id === cut?.butcher_id) ?? null;

  return (
    <main className="relative min-h-dvh">
      {/* over the photo (design: Cut): a round back button, and the cut's code — tap it to share the cut */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" aria-label={he.app.back}
          onClick={() => (window.history.length > 1 ? router.back() : router.push(butcher ? shopPath(butcher) : "/"))}
          className={overlayBtn}>
          <IconBack />
        </button>
        {cut && (
          <button type="button" aria-label={he.cut.share}
            onClick={async () => {
              const url = `${window.location.origin}/cut/${cut.code}`;
              try {
                if (navigator.share) await navigator.share({ title: cutTitle(cut, breeds), url });
                else { await navigator.clipboard.writeText(url); toast(he.cut.linkCopied, { tone: "success" }); }
              } catch { /* user cancelled */ }
            }}
            className="code pointer-events-auto self-center rounded-full bg-scrim px-2.5 py-1.5 text-ivory">
            {cut.code}
          </button>
        )}
      </div>

      {state === "loading" && <div className="grid min-h-dvh place-items-center"><Spinner /></div>}
      {state === "error" && <div className="pt-20"><ErrorState dark onRetry={load} /></div>}
      {(state === "notfound" || (cut && cut.status === "withdrawn")) && (
        <div className="pt-20"><ErrorState dark text={state === "notfound" ? he.cut.notFound : he.cut.unavailable} /></div>
      )}

      {state === "ok" && cut && cut.status !== "withdrawn" && (
        <>
          <CutDetail cut={cut} media={media} breeds={breeds} butcher={butcher} />
          <PurchaseBar cut={cut} onOrder={addToCart} inCart={!!inCart}
            initialMode={inCart?.mode} initialQty={inCart?.qty} key={inCart ? `${inCart.mode}-${inCart.qty}` : "new"} />
        </>
      )}
    </main>
  );
}
