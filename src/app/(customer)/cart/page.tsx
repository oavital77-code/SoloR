"use client";
// The cart (stage 2): every chosen cut, grouped by shop, with live price and stock.
// Nothing is reserved until "confirm": place_checkout then buys the whole cart or nothing, and splits it
// into one order per shop. Guests fill the cart freely; signing in is asked for only to confirm.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { BackLink } from "@/components/customer/market-ui";
import { useToast } from "@/components/Toast";
import { BottomSheet, Button, EmptyState, ErrorState, Ltr, Skeleton, Stepper, inputDarkClass } from "@/components/ui";
import { cart, useCart, type CartLine } from "@/lib/cart";
import { canBuyWhole, coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { cartProblemText, cartProblemsOf, errorText, type CartProblem } from "@/lib/errors";
import { he } from "@/lib/i18n/he";
import { useBreeds, useButchers, useRefetchOnFocus, useSession } from "@/lib/hooks";
import { formatAgorot, formatWeight, steaksOrderPrice, wholePrice } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Butcher, Checkout, CutWithMedia } from "@/lib/types";

interface Row {
  line: CartLine;
  cut: CutWithMedia | null;
  price: number;
  problem: string | null;
}

/** What is wrong with a line right now, from live stock (null = can be bought). */
function lineProblem(line: CartLine, cut: CutWithMedia | null, server?: CartProblem): string | null {
  if (!cut || !["published", "sold_out"].includes(cut.status)) return he.errors.CUT_NOT_AVAILABLE;
  if (line.mode === "whole") {
    if (!canBuyWhole(cut)) return cut.status === "sold_out" ? he.errors.CUT_NOT_AVAILABLE : he.errors.WHOLE_NOT_AVAILABLE;
  } else if ((line.qty ?? 1) > cut.steaks_available) {
    return he.errors.NOT_ENOUGH_STEAKS(cut.steaks_available);
  }
  return server ? cartProblemText(server) : null;
}

function linePrice(line: CartLine, cut: CutWithMedia | null): number {
  if (!cut?.price_per_kg_agorot) return line.estAgorot;
  return line.mode === "whole"
    ? wholePrice(cut.weight_g ?? 0, cut.price_per_kg_agorot)
    : steaksOrderPrice(cut.steak_weight_g ?? 0, cut.price_per_kg_agorot, line.qty ?? 1);
}

export default function CartPage() {
  const lines = useCart();
  const breeds = useBreeds();
  const butchers = useButchers();
  const { user } = useSession();
  const router = useRouter();
  const toast = useToast();
  // live cuts for the lines in the cart, tagged with the cart they were loaded for (stale answers are ignored)
  const [loaded, setLoaded] = useState<{ ids: string; map: Map<string, CutWithMedia> } | null>(null);
  const [error, setError] = useState(false);
  const [serverProblems, setServerProblems] = useState<CartProblem[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const ids = useMemo(() => lines.map((l) => l.cutId).sort().join(","), [lines]);
  const latestIds = useRef(ids);
  latestIds.current = ids;
  const load = useCallback(async () => {
    if (!ids) { setLoaded({ ids, map: new Map() }); return; }
    const { data, error } = await supabaseBrowser().from("cuts").select("*, cut_media(*)").in("id", ids.split(","));
    if (error) { setError(true); return; }
    setError(false);
    if (latestIds.current !== ids) return;          // the cart changed while this was loading
    setLoaded({ ids, map: new Map(((data ?? []) as CutWithMedia[]).map((c) => [c.id, c])) });
  }, [ids]);
  const cuts = loaded?.ids === ids ? loaded.map : null;
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  // stock in the cart follows the shops live
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel("cart-cuts")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cuts" }, (p) => {
        const row = p.new as CutWithMedia;
        setLoaded((cur) => (cur?.map.has(row.id)
          ? { ids: cur.ids, map: new Map(cur.map).set(row.id, { ...cur.map.get(row.id)!, ...row }) } : cur));
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, []);

  const rows: Row[] = lines.map((line) => {
    const cut = cuts?.get(line.cutId) ?? null;
    const server = serverProblems.find((p) => p.cut_id === line.cutId);
    return { line, cut, price: linePrice(line, cut), problem: cuts ? lineProblem(line, cut, server) : null };
  });
  const groups = groupByShop(rows, butchers);
  const total = rows.filter((r) => !r.problem).reduce((s, r) => s + r.price, 0);
  const blocked = rows.some((r) => r.problem);

  function proceed() {
    if (!user) { router.push(`/login?next=${encodeURIComponent("/cart")}`); return; }
    setConfirming(true);
  }

  async function placed(k: Checkout) {
    cart.clear();
    toast(he.checkout.success(k.checkout_number), { tone: "success" });
    router.replace(`/orders/${k.id}`);
  }

  function failed(problems: CartProblem[]) {
    setServerProblems(problems);
    setConfirming(false);
    load();
  }

  return (
    <main className="min-h-dvh px-4 pb-28">
      <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <BackLink onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))} label={he.app.back} />
        <h1 className="mt-1 font-display text-3xl font-bold text-ivory">{he.cart.title}</h1>
        {lines.length > 0 && (
          <p className="mt-1 text-sm text-stone">
            {he.cart.items(lines.length)} {groups.length > 0 && he.cart.shopCount(groups.length)}
          </p>
        )}
      </header>

      {lines.length === 0 ? (
        <EmptyState text={he.cart.empty}>
          <Link href="/"><Button variant="dark">{he.cart.toMarket}</Button></Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : (
          <div className="flex flex-col gap-8">
            {groups.map(({ shop, rows: shopRows }) => (
              <section key={shop?.id ?? "?"} className="border-t border-ivory/10 pt-5">
                <p className="eyebrow">{shop?.name}</p>
                {shop && <p className="mt-1 text-xs text-stone">{he.checkout.pickup(shop.name, shop.address, shop.pickup_hours)}</p>}
                <ul className="mt-3 flex flex-col divide-y divide-ivory/10">
                  {shopRows.map((r) => <CartRow key={r.line.cutId} row={r} title={r.cut ? cutTitle(r.cut, breeds) : r.line.code} />)}
                </ul>
                {shop && (
                  <label className="mt-3 flex flex-col gap-1.5">
                    <span className="text-xs text-stone">{he.cart.noteFor(shop.name)}</span>
                    <textarea rows={2} maxLength={300} className={inputDarkClass + " py-2.5 text-sm"} placeholder={he.checkout.notePlaceholder}
                      value={notes[shop.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [shop.id]: e.target.value }))} />
                  </label>
                )}
              </section>
            ))}

            <section className="border-t border-ivory/10 pt-5">
              {groups.length > 1 && <p className="mb-4 text-sm leading-relaxed text-stone">{he.cart.splitNote}</p>}
              <p className="text-sm text-stone">{he.cart.subtotal}</p>
              <p className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(total)}</Ltr></p>
              {blocked && <p className="mt-3 text-sm text-[#e8a0a8]" role="alert">{he.cart.fixFirst}</p>}
              {!user && <p className="mt-3 text-sm text-stone">{he.cart.loginToPay}</p>}
              <Button size="lg" className="mt-4 w-full" disabled={blocked} onClick={proceed}>{he.cart.proceed}</Button>
              <Link href="/" className="mt-2 inline-block min-h-11 py-3 text-sm text-ivory/70 underline-offset-4 hover:underline">
                {he.cart.continueShopping}
              </Link>
            </section>
          </div>
        )}

      {confirming && (
        <ConfirmSheet groups={groups} total={total} notes={notes} breeds={breeds}
          onClose={() => setConfirming(false)} onPlaced={placed} onUnavailable={failed} />
      )}
    </main>
  );
}

function groupByShop(rows: Row[], butchers: Butcher[]) {
  const order: string[] = [];
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    const bid = r.cut?.butcher_id ?? r.line.butcherId;
    if (!by.has(bid)) { by.set(bid, []); order.push(bid); }
    by.get(bid)!.push(r);
  }
  return order.map((bid) => ({ shop: butchers.find((b) => b.id === bid) ?? null, rows: by.get(bid)! }));
}

function CartRow({ row: { line, cut, price, problem }, title }: { row: Row; title: string }) {
  const cover = cut ? coverOf(cut.cut_media) : undefined;
  const maxQty = Math.max(1, cut?.steaks_available ?? 1);
  return (
    <li className="flex flex-col items-center gap-2 py-4">
      <Link href={`/cut/${line.code}`} className="flex flex-col items-center gap-2">
        <div className={clsx("size-20 overflow-hidden rounded-md bg-ink-3", problem && "opacity-50 grayscale")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt={`${title} ${line.code}`} className="h-full w-full object-cover" />}
        </div>
        <p className="font-display text-lg font-bold text-ivory">{title}</p>
      </Link>
      <p className="text-xs text-stone"><Ltr>{line.code}</Ltr></p>
      {line.mode === "steaks" && cut?.steak_weight_g ? (
        <div className="flex flex-col items-center gap-1">
          <Stepper dark value={Math.min(line.qty ?? 1, maxQty)} min={1} max={maxQty} label={he.cut.steaks}
            onChange={(v) => cart.setQty(line.cutId, v)} />
          <p className="text-sm text-stone">{he.cut.steaksSummary(line.qty ?? 1, cut.steak_weight_g, formatWeight(cut.steak_weight_g * (line.qty ?? 1)))}</p>
        </div>
      ) : (
        <p className="text-sm text-stone">{he.cut.whole}{cut?.weight_g ? <> · <Ltr>{formatWeight(cut.weight_g)}</Ltr></> : null}</p>
      )}
      <p className={clsx("font-display text-xl font-bold", problem ? "text-stone line-through" : "text-ivory")}>
        <Ltr>₪{formatAgorot(price)}</Ltr>
      </p>
      {problem && <p className="text-sm text-[#e8a0a8]" role="alert">{problem}</p>}
      <button type="button" onClick={() => cart.remove(line.cutId)} className="min-h-10 text-sm text-ivory/60 underline-offset-4 hover:underline">
        {he.cart.remove}
      </button>
    </li>
  );
}

function ConfirmSheet({ groups, total, notes, breeds, onClose, onPlaced, onUnavailable }: {
  groups: ReturnType<typeof groupByShop>; total: number; notes: Record<string, string>; breeds: ReturnType<typeof useBreeds>;
  onClose: () => void; onPlaced: (k: Checkout) => void; onUnavailable: (p: CartProblem[]) => void;
}) {
  // one idempotency key per opened sheet: double taps / retries can never create two purchases
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const items = groups.flatMap((g) => g.rows.map(({ line }) => ({
      cut_id: line.cutId, mode: line.mode, steaks_qty: line.mode === "steaks" ? line.qty : null,
    })));
    const p_notes = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const { data, error } = await supabaseBrowser().rpc("place_checkout", { p_items: items, p_idempotency_key: key, p_notes });
    setBusy(false);
    if (error) {
      const problems = cartProblemsOf(error);
      if (problems.length) {
        toast(he.errors.CART_UNAVAILABLE, { tone: "error" });
        onUnavailable(problems);
        return;
      }
      setError(errorText(error));
      return;
    }
    onPlaced(data as Checkout);
  }

  return (
    <BottomSheet open onClose={onClose} title={he.checkout.title} dark>
      <div className="flex flex-col gap-4 text-center">
        {groups.map(({ shop, rows }) => (
          <div key={shop?.id ?? "?"} className="border-b border-ivory/10 pb-3">
            <p className="eyebrow">{shop?.name}</p>
            <ul className="mt-1 text-sm text-ivory/85">
              {rows.map(({ line, cut, price }) => (
                <li key={line.cutId}>
                  {cut ? cutTitle(cut, breeds) : line.code} · {line.mode === "whole" ? he.cut.whole : he.cut.steaksCount(line.qty ?? 1)} · <Ltr>₪{formatAgorot(price)}</Ltr>
                </li>
              ))}
            </ul>
            {shop && <p className="mt-1 text-xs text-stone">{he.checkout.pickup(shop.name, shop.address, shop.pickup_hours)}</p>}
          </div>
        ))}
        <div>
          <p className="text-sm text-stone">{he.checkout.total}</p>
          <p className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(total)}</Ltr></p>
          <p className="text-xs text-stone">{he.cut.priceNoteLong}</p>
        </div>
        <div className="rounded-xl p-3 text-xs leading-relaxed text-ivory/80 ring-1 ring-ivory/15">
          <p className="mb-1 text-center font-semibold text-ivory">{he.cart.weightRulesTitle}</p>
          {he.cart.weightRules}
        </div>
        <div className="rounded-xl px-4 py-3 text-center text-sm text-gold ring-1 ring-gold/40">{he.app.prototypeBanner}</div>
        {error && <p role="alert" className="text-sm text-[#e8a0a8]">{error}</p>}
        <Button size="xl" loading={busy} onClick={confirm}>{busy ? he.checkout.confirming : he.checkout.confirm}</Button>
      </div>
    </BottomSheet>
  );
}
