"use client";
// C4 + C5 — cut page with live stock, purchase bar and the order confirmation sheet.
import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CutDetail } from "@/components/CutDetail";
import { PurchaseBar } from "@/components/PurchaseBar";
import { BottomSheet, Button, ErrorState, Ltr, Spinner, inputDarkClass } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { errorCode, errorText } from "@/lib/errors";
import { useBreeds, useButchers, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot, formatWeight, steaksOrderPrice, wholePrice } from "@/lib/pricing";
import { shopPath } from "@/lib/market";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Cut, CutMedia, Order, OrderMode } from "@/lib/types";

const overlayBtn = "pointer-events-auto min-h-10 rounded-full bg-ink/55 px-4 text-sm tracking-wide text-ivory backdrop-blur-md ring-1 ring-ivory/15";

export default function CutPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const breeds = useBreeds();
  const butchers = useButchers();
  const toast = useToast();
  const [cut, setCut] = useState<Cut | null>(null);
  const [media, setMedia] = useState<CutMedia[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "notfound" | "error">("loading");
  const [checkout, setCheckout] = useState<{ mode: OrderMode; qty: number | null } | null>(null);
  const router = useRouter();
  // choice carried through login (`?mode=&qty=&checkout=1`)
  const [resume, setResume] = useState<{ mode: OrderMode | null; qty: number | null; open: boolean }>({ mode: null, qty: null, open: false });
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const m = sp.get("mode");
    setResume({
      mode: m === "whole" || m === "steaks" ? m : null,
      qty: Number(sp.get("qty")) || null,
      open: sp.get("checkout") === "1",
    });
  }, []);

  // guests browse freely; identity is asked only when ordering, and the choice is kept
  const startOrder = useCallback(async (mode: OrderMode, qty: number | null) => {
    const { data: { session } } = await supabaseBrowser().auth.getSession();
    if (!session) {
      const back = `/cut/${encodeURIComponent(code)}?mode=${mode}&qty=${qty ?? ""}&checkout=1`;
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }
    setCheckout({ mode, qty });
  }, [code, router]);

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

  // back from login: reopen the confirmation sheet once the cut is loaded
  useEffect(() => {
    if (!resume.open || !cut || cut.status !== "published") return;
    setResume((r) => ({ ...r, open: false }));
    startOrder(resume.mode ?? (cut.sale_mode === "whole" ? "whole" : "steaks"), resume.mode === "whole" ? null : resume.qty ?? 1);
    window.history.replaceState(null, "", `/cut/${cut.code}`);
  }, [resume, cut, startOrder]);

  return (
    <main className="relative min-h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push(butcher ? shopPath(butcher) : "/"))}
          className={overlayBtn}>
          {he.app.back}
        </button>
        {cut && (
          <button type="button"
            onClick={async () => {
              const url = `${window.location.origin}/cut/${cut.code}`;
              try {
                if (navigator.share) await navigator.share({ title: cutTitle(cut, breeds), url });
                else { await navigator.clipboard.writeText(url); toast(he.cut.linkCopied, { tone: "success" }); }
              } catch { /* user cancelled */ }
            }}
            className={overlayBtn}>
            {he.cut.share}
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
          <PurchaseBar cut={cut} onOrder={startOrder} initialMode={resume.mode} initialQty={resume.qty} key={`${resume.mode}-${resume.qty}`} />
          {checkout && (
            <CheckoutSheet
              cut={cut} media={media} title={cutTitle(cut, breeds)} butcher={butcher}
              mode={checkout.mode} qty={checkout.qty}
              onClose={() => setCheckout(null)} onStockError={load}
            />
          )}
        </>
      )}
    </main>
  );
}

function CheckoutSheet({ cut, media, title, butcher, mode, qty, onClose, onStockError }: {
  cut: Cut; media: CutMedia[]; title: string; butcher: ReturnType<typeof useButchers>[number] | null;
  mode: OrderMode; qty: number | null; onClose: () => void; onStockError: () => void;
}) {
  const router = useRouter();
  // one idempotency key per opened sheet: double taps / retries can never create two orders
  const [key] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; busted: boolean } | null>(null);
  const [done, setDone] = useState<Order | null>(null);

  const cover = coverOf(media);
  const total = mode === "whole"
    ? wholePrice(cut.weight_g ?? 0, cut.price_per_kg_agorot ?? 0)
    : steaksOrderPrice(cut.steak_weight_g ?? 0, cut.price_per_kg_agorot ?? 0, qty ?? 0);
  const what = mode === "whole"
    ? `${he.cut.whole} · ${formatWeight(cut.weight_g ?? 0)}`
    : he.cut.steaksSummary(qty ?? 0, cut.steak_weight_g ?? 0, formatWeight((cut.steak_weight_g ?? 0) * (qty ?? 0)));

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabaseBrowser().rpc("place_order", {
      p_cut_id: cut.id, p_mode: mode, p_steaks_qty: mode === "steaks" ? qty : null,
      p_idempotency_key: key, p_note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      const code = errorCode(error);
      const busted = code === "NOT_ENOUGH_STEAKS" || code === "CUT_NOT_AVAILABLE" || code === "WHOLE_NOT_AVAILABLE";
      setError({ text: errorText(error), busted });
      if (busted) onStockError();
      return;
    }
    setDone(data as Order);
    window.setTimeout(() => router.push(`/orders/${(data as Order).id}`), 1600);
  }

  if (done) {
    return (
      <BottomSheet open onClose={() => router.push(`/orders/${done.id}`)} dark>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <p className="font-display text-3xl font-bold text-ivory">{he.checkout.success(done.order_number)}</p>
          <Button size="lg" onClick={() => router.push(`/orders/${done.id}`)}>{he.checkout.toOrder}</Button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet open onClose={onClose} title={he.checkout.title} dark>
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <div className="size-20 shrink-0 overflow-hidden rounded-xl bg-ink-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${cut.code}`} className="h-full w-full object-cover" />}
          </div>
          <div className="flex flex-col justify-center gap-0.5">
            <p className="font-display text-xl font-bold text-ivory">{title}</p>
            <p className="text-sm text-stone">{what}</p>
            <p className="font-display text-2xl font-bold text-ivory"><Ltr>₪{formatAgorot(total)}</Ltr></p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-stone">{he.cut.priceNoteLong}</p>

        {butcher && (
          <p className="border-y border-ivory/10 py-3 text-[15px] leading-relaxed text-ivory/85">
            {he.checkout.pickup(butcher.name, butcher.address, butcher.pickup_hours)}
          </p>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-sm text-ivory/80">{he.checkout.note}</span>
          <textarea rows={2} maxLength={300} className={inputDarkClass + " py-3"} placeholder={he.checkout.notePlaceholder}
            value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <div className="rounded-xl px-4 py-3 text-center text-sm text-gold ring-1 ring-gold/40">{he.app.prototypeBanner}</div>

        {error && (
          <div role="alert" className="flex flex-col items-center gap-2 rounded-xl p-4 text-center ring-1 ring-live/40">
            {error.busted && <p className="animate-busted font-display text-2xl font-bold text-live">{he.checkout.busted}</p>}
            <p className="font-bold">{error.text}</p>
          </div>
        )}

        <Button size="xl" loading={busy} disabled={!!error?.busted} onClick={confirm}>
          {busy ? he.checkout.confirming : he.checkout.confirm}
        </Button>
        {error?.busted && <Button variant="dark" onClick={onClose}>{he.app.back}</Button>}
      </div>
    </BottomSheet>
  );
}
