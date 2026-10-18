"use client";
// Checkout (customer spec §10): contact details → how each shop's part is received (only what the shop turned
// on; with delivery off nothing about delivery shows) → a binding summary → an atomic stock check that holds the
// whole cart for a few minutes → the payment, which in the prototype is a confirmation ("לא יבוצע חיוב").
// A line that cannot be held is explained, with a way to remove it and go on; nothing is swapped for another cut.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { BackLink } from "@/components/customer/market-ui";
import { useCartRows, type ShopGroup } from "@/components/customer/useCartRows";
import { useToast } from "@/components/Toast";
import { BottomSheet, Button, EmptyState, ErrorState, Field, Ltr, Skeleton, Spinner, inputDarkClass } from "@/components/ui";
import { cart } from "@/lib/cart";
import { deliveryArea, deliveryFee, formatCountdown, receiveOptions } from "@/lib/checkout";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { cartProblemsOf, errorCode, errorText, type CartProblem } from "@/lib/errors";
import { formatWeek, isolateTimes } from "@/lib/hours";
import { he } from "@/lib/i18n/he";
import { useBreeds, useNow, useSession } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Breed, Butcher, Checkout, Hold, ReceiveMethod } from "@/lib/types";
import { normalizePhone } from "@/lib/validation";
import { track } from "@/lib/track";

interface ReceiveDraft {
  method: ReceiveMethod | null;
  name: string;
  phone: string;
  street: string;
  city: string;
  notes: string;
  window: string | null;
}
const PHONE = /^05\d-\d{7}$/;

export default function CheckoutPage() {
  const router = useRouter();
  const toast = useToast();
  const breeds = useBreeds();
  const { profile } = useSession();
  const [serverProblems, setServerProblems] = useState<CartProblem[]>([]);
  const { lines, cuts, error, load, groups, total: itemsTotal, blocked } = useCartRows(serverProblems);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [receive, setReceive] = useState<Record<string, ReceiveDraft>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [receiveError, setReceiveError] = useState<{ bid: string; text: string } | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const busyRef = useRef(false);
  const started = cuts !== null;
  const startLogged = useRef(false);
  useEffect(() => {
    if (!started || startLogged.current || !lines.length) return;
    startLogged.current = true;
    track("checkout_start", { items_count: lines.length, total: itemsTotal });
  }, [started]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (profile) { setName((n) => n || profile.full_name); setPhone((p) => p || profile.phone); }
  }, [profile]);

  const draftOf = (g: ShopGroup): ReceiveDraft => receive[g.butcherId] ?? {
    method: g.shop ? receiveOptions(g.shop)[0] ?? null : null,
    name: "", phone: "", street: "", city: "", notes: "", window: null,
  };
  const setDraft = (bid: string, patch: Partial<ReceiveDraft>, base: ReceiveDraft) => {
    setReceive((r) => ({ ...r, [bid]: { ...(r[bid] ?? base), ...patch } }));
    setReceiveError(null);
  };

  // what each shop's part costs to receive, and whether its details are complete
  const parts = groups.map((g) => {
    const d = draftOf(g);
    const area = d.method === "delivery" && g.shop ? deliveryArea(g.shop, d.city) : null;
    const recipientName = d.name.trim() || name.trim();
    const recipientPhone = normalizePhone(d.phone || phone);
    const ok = d.method === "pickup" || (d.method === "delivery" && !!area && d.street.trim().length >= 2
      && recipientName.length >= 2 && PHONE.test(recipientPhone));
    const fee = d.method === "delivery" && area && g.shop ? deliveryFee(g.shop, area) : 0;
    return { g, d, area, fee, ok, recipientName, recipientPhone };
  });
  const fees = parts.reduce((s, p) => s + p.fee, 0);
  const contactOk = name.trim().length >= 2 && PHONE.test(normalizePhone(phone));
  const ready = contactOk && parts.every((p) => p.ok) && !blocked;

  const release = useCallback((h: Hold | null) => {
    if (h?.status === "active") supabaseBrowser().rpc("release_hold", { p_hold_id: h.id }).then(() => {});
  }, []);
  // leaving the checkout with a live hold frees the cuts at once
  const holdRef = useRef<Hold | null>(null);
  holdRef.current = hold;
  useEffect(() => () => release(holdRef.current), [release]);

  async function reserve() {
    setTried(true);
    if (!ready || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const items = groups.flatMap((g) => g.rows.map(({ line }) => ({
      cut_id: line.cutId, mode: line.mode, steaks_qty: line.mode === "steaks" ? line.qty : null,
    })));
    const p_receive = Object.fromEntries(parts.map((p) => [p.g.butcherId, p.d.method === "delivery"
      ? { method: "delivery", window: p.d.window,
          address: { name: p.recipientName, phone: p.recipientPhone, street: p.d.street.trim(), city: p.d.city.trim(), notes: p.d.notes.trim() || null } }
      : { method: "pickup" }]));
    const p_notes = Object.fromEntries(Object.entries(notes).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
    const { data, error } = await supabaseBrowser().rpc("reserve_checkout", {
      p_items: items, p_idempotency_key: crypto.randomUUID(), p_receive, p_notes,
      p_contact: { name: name.trim(), phone: normalizePhone(phone) },
    });
    busyRef.current = false;
    setBusy(false);
    if (error) {
      const problems = cartProblemsOf(error);
      if (problems.length) {
        problems.forEach((p) => track("reservation_failed", { cut_id: p.cut_id, reason: p.reason }));
        setServerProblems(problems);
        load();
        toast(he.errors.CART_UNAVAILABLE, { tone: "error" });
      } else if (["RECEIVE_NOT_AVAILABLE", "DELIVERY_NOT_ELIGIBLE", "INVALID_ADDRESS", "INVALID_WINDOW"].includes(errorCode(error))) {
        setReceiveError({ bid: error.details ?? "", text: errorText(error) });
      } else {
        toast(errorText(error), { tone: "error" });
      }
      return;
    }
    setServerProblems([]);
    setHold(data as Hold);
  }

  async function pay() {
    if (!hold || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("pay_checkout", { p_hold_id: hold.id });
    busyRef.current = false;
    setBusy(false);
    if (error) {
      track("payment_failed", { hold_id: hold.id, total: hold.total_agorot, reason: errorCode(error) });
      const code = errorCode(error);
      const problems = cartProblemsOf(error);
      if (problems.length || code === "PRICE_CHANGED" || code === "HOLD_RELEASED") {
        release(hold);
        setHold(null);
        setServerProblems(problems);
        load();
      }
      toast(problems.length ? he.errors.CART_UNAVAILABLE : errorText(error), { tone: "error" });
      return;
    }
    const k = data as Checkout;
    track("payment_success", { order_id: k.id, total: k.total_agorot, items_count: lines.length });
    setDone(true);
    holdRef.current = null;
    cart.clear();
    router.replace(`/orders/${k.id}/confirmation`);
  }

  function back() {
    release(hold);
    setHold(null);
  }

  if (done) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  const step = hold ? 3 : tried && ready ? 2 : contactOk ? 1 : 0;

  return (
    <main className="min-h-dvh px-4 pb-32">
      <header className="pt-3 pb-4">
        <BackLink href="/cart" label={he.cart.title} />
        <h1 className="mt-1 font-display text-3xl font-bold text-ivory">{he.checkout.title}</h1>
        <Steps current={step} />
      </header>

      {lines.length === 0 ? (
        <EmptyState text={he.checkout.empty}>
          <Link href="/"><Button variant="dark">{he.cart.toMarket}</Button></Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28" />)}</div>
        : (
          <div className="flex flex-col gap-8">
            <Section n={1} title={he.checkout.contactTitle} hint={he.checkout.contactHint}>
              <div className="flex flex-col gap-4">
                <Field dark label={he.checkout.name} htmlFor="c-name" error={tried && name.trim().length < 2 ? he.onboarding.invalidName : null}>
                  <input id="c-name" autoComplete="name" className={inputDarkClass} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Field dark label={he.checkout.phone} htmlFor="c-phone" error={tried && !PHONE.test(normalizePhone(phone)) ? he.onboarding.invalidPhone : null}>
                  <input id="c-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder={he.onboarding.phonePlaceholder}
                    className={inputDarkClass} value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setPhone((p) => normalizePhone(p))} />
                </Field>
              </div>
            </Section>

            <Section n={2} title={he.checkout.receiveTitle}>
              <div className="flex flex-col gap-6">
                {parts.map((p) => (
                  <ShopReceive key={p.g.butcherId} group={p.g} draft={p.d} area={p.area} fee={p.fee} tried={tried}
                    many={parts.length > 1} contactName={name} contactPhone={phone}
                    error={receiveError?.bid === p.g.butcherId ? receiveError.text : null}
                    onChange={(patch) => setDraft(p.g.butcherId, patch, p.d)}
                    note={notes[p.g.butcherId] ?? ""} onNote={(v) => setNotes((n) => ({ ...n, [p.g.butcherId]: v }))} />
                ))}
              </div>
            </Section>

            <Section n={3} title={he.checkout.summaryTitle}>
              <Summary parts={parts} breeds={breeds} itemsTotal={itemsTotal} fees={fees} />
              {blocked && (
                <div className="mt-4 rounded-xl p-4 text-center ring-1 ring-[#e8a0a8]/40" role="alert">
                  <p className="font-semibold text-[#e8a0a8]">{he.checkout.unavailableTitle}</p>
                  <p className="mt-1 text-sm text-ivory/70">{he.checkout.unavailableHint}</p>
                </div>
              )}
              <div className="mt-4 rounded-xl p-3 text-xs leading-relaxed text-ivory/80 ring-1 ring-ivory/15">
                <p className="mb-1 text-center font-semibold text-ivory">{he.cart.weightRulesTitle}</p>
                {he.cart.weightRules}
              </div>
              <div className="mt-4 rounded-xl px-4 py-3 text-center text-sm font-semibold text-gold ring-1 ring-gold/40">{he.app.prototypeBanner}</div>
              {tried && !ready && !blocked && <p className="mt-3 text-center text-sm text-[#e8a0a8]" role="alert">{he.checkout.fixDetails}</p>}
              <Button size="xl" className="mt-4 w-full" loading={busy && !hold} disabled={blocked} onClick={reserve}>
                {busy && !hold ? he.checkout.reserving : he.checkout.reserve}
              </Button>
            </Section>
          </div>
        )}

      {hold && <PaySheet hold={hold} busy={busy} onPay={pay} onBack={back} />}
    </main>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={he.checkout.title}>
      {he.checkout.steps.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} className="flex flex-col items-center gap-1.5">
          <span className={clsx("h-1 w-full rounded-full", i <= current ? "bg-gold" : "bg-ivory/15")} />
          <span className={clsx("text-[11px]", i === current ? "font-semibold text-ivory" : "text-stone")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-ivory/10 pt-5">
      <p className="eyebrow"><Ltr>{n}</Ltr> · {title}</p>
      {hint && <p className="mt-1 text-center text-xs text-stone">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ShopReceive({ group, draft, area, fee, tried, many, contactName, contactPhone, error, onChange, note, onNote }: {
  group: ShopGroup; draft: ReceiveDraft; area: string | null; fee: number; tried: boolean; many: boolean;
  contactName: string; contactPhone: string; error: string | null;
  onChange: (patch: Partial<ReceiveDraft>) => void; note: string; onNote: (v: string) => void;
}) {
  const shop = group.shop;
  if (!shop) return null;
  const options = receiveOptions(shop);
  const hours = formatWeek(shop.opening_hours) || shop.pickup_hours;
  const place = [shop.address, shop.city].filter(Boolean).join(", ");
  return (
    <div className="rounded-2xl bg-ivory/[0.03] p-4 ring-1 ring-ivory/10">
      {many && <p className="mb-3 text-center font-display text-lg font-bold text-ivory">{he.checkout.receiveFrom(shop.name)}</p>}
      {options.length === 0 ? (
        <p className="text-center text-sm text-[#e8a0a8]" role="alert">{he.checkout.noReceive}</p>
      ) : (
        <>
          {options.length > 1 && (
            <div className="mb-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label={he.checkout.receiveMethod}>
              {options.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={draft.method === m} onClick={() => onChange({ method: m })}
                  className={clsx("min-h-12 rounded-xl text-[15px] font-semibold ring-1 transition-colors",
                    draft.method === m ? "bg-ivory text-ink ring-ivory" : "text-ivory/80 ring-ivory/20")}>
                  {m === "pickup" ? he.checkout.pickupLabel : he.checkout.deliveryLabel}
                </button>
              ))}
            </div>
          )}

          {draft.method === "pickup" ? (
            <dl className="flex flex-col gap-3 text-center text-[15px]">
              {options.length === 1 && <p className="font-semibold text-ivory">{he.checkout.pickupLabel}</p>}
              <div>
                <dt className="text-xs text-stone">{he.checkout.pickupAt}</dt>
                <dd className="text-ivory/90">{shop.name} · {place}</dd>
              </div>
              {hours && (
                <div>
                  <dt className="text-xs text-stone">{he.checkout.hours}</dt>
                  <dd className="text-ivory/90">{isolateTimes(hours)}</dd>
                </div>
              )}
            </dl>
          ) : (
            <div className="flex flex-col gap-4">
              {options.length === 1 && <p className="text-center font-semibold text-ivory">{he.checkout.deliveryLabel}</p>}
              <p className="text-center text-xs text-stone">{he.checkout.recipientHint}</p>
              <Field dark label={he.checkout.recipientName} htmlFor={`r-name-${shop.id}`}>
                <input id={`r-name-${shop.id}`} className={inputDarkClass} placeholder={contactName} maxLength={80}
                  value={draft.name} onChange={(e) => onChange({ name: e.target.value })} />
              </Field>
              <Field dark label={he.checkout.recipientPhone} htmlFor={`r-phone-${shop.id}`}>
                <input id={`r-phone-${shop.id}`} type="tel" inputMode="tel" dir="ltr" className={inputDarkClass} placeholder={contactPhone}
                  value={draft.phone} onChange={(e) => onChange({ phone: e.target.value })} />
              </Field>
              <Field dark label={he.checkout.street} htmlFor={`r-street-${shop.id}`}
                error={tried && draft.street.trim().length < 2 ? he.errors.INVALID_ADDRESS : null}>
                <input id={`r-street-${shop.id}`} autoComplete="street-address" className={inputDarkClass} maxLength={120}
                  value={draft.street} onChange={(e) => onChange({ street: e.target.value })} />
              </Field>
              <Field dark label={he.checkout.city} htmlFor={`r-city-${shop.id}`}
                error={draft.city.trim() && !area ? he.checkout.notEligible : tried && !area ? he.errors.INVALID_ADDRESS : null}
                hint={shop.delivery_areas.length ? he.checkout.areas(shop.delivery_areas.join(", ")) : undefined}>
                <input id={`r-city-${shop.id}`} list={`areas-${shop.id}`} autoComplete="address-level2" className={inputDarkClass}
                  value={draft.city} onChange={(e) => onChange({ city: e.target.value })} />
                <datalist id={`areas-${shop.id}`}>{shop.delivery_areas.map((a) => <option key={a} value={a} />)}</datalist>
              </Field>
              <Field dark label={he.checkout.addressNotes} htmlFor={`r-notes-${shop.id}`}>
                <input id={`r-notes-${shop.id}`} className={inputDarkClass} maxLength={200}
                  value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} />
              </Field>
              <div className="flex flex-col items-center gap-2">
                <p className="text-[15px] font-bold">{he.checkout.window}</p>
                {shop.delivery_windows.length ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    {shop.delivery_windows.map((w) => (
                      <button key={w} type="button" aria-pressed={draft.window === w} onClick={() => onChange({ window: draft.window === w ? null : w })}
                        className={clsx("min-h-10 rounded-full px-4 text-sm ring-1", draft.window === w ? "bg-ivory text-ink ring-ivory" : "text-ivory/80 ring-ivory/20")}>
                        {isolateTimes(w)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!draft.window && <p className="text-center text-sm text-stone">{he.checkout.pendingCoordination}</p>}
              </div>
              {area && (
                <p className="text-center text-sm text-ivory/80">
                  {he.checkout.deliveryFee}: {fee ? <Ltr>₪{formatAgorot(fee)}</Ltr> : he.checkout.deliveryFeeNone}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="mt-3 text-center text-sm text-[#e8a0a8]" role="alert">{error}</p>}
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-center text-xs text-stone">{he.cart.noteFor(shop.name)}</span>
        <textarea rows={2} maxLength={300} className={inputDarkClass + " py-2.5 text-sm"} placeholder={he.checkout.notePlaceholder}
          value={note} onChange={(e) => onNote(e.target.value)} />
      </label>
    </div>
  );
}

function Summary({ parts, breeds, itemsTotal, fees }: {
  parts: { g: ShopGroup; d: ReceiveDraft; fee: number; area: string | null }[]; breeds: Breed[]; itemsTotal: number; fees: number;
}) {
  return (
    <div className="flex flex-col gap-5">
      {parts.map(({ g, d, fee, area }) => (
        <div key={g.butcherId}>
          <p className="text-center font-display text-lg font-bold text-ivory">{g.shop?.name}</p>
          <ul className="mt-2 flex flex-col divide-y divide-ivory/10">
            {g.rows.map(({ line, cut, price, problem }) => {
              const cover = cut ? coverOf(cut.cut_media) : undefined;
              const title = cut ? cutTitle(cut, breeds) : line.code;
              return (
                <li key={line.cutId} className="flex items-center gap-3 py-3">
                  <div className={clsx("size-14 shrink-0 overflow-hidden rounded-md bg-ink-3", problem && "opacity-50 grayscale")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1 text-start">
                    <p className="truncate font-semibold text-ivory">{title}</p>
                    <p className="text-xs text-stone">
                      {line.mode === "whole" ? he.cut.whole : he.cut.steaksCount(line.qty ?? 1)} · <Ltr>{line.code}</Ltr>
                    </p>
                    {problem && <p className="mt-0.5 text-xs text-[#e8a0a8]" role="alert">{problem}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className={clsx("font-semibold", problem ? "text-stone line-through" : "text-ivory")}><Ltr>₪{formatAgorot(price)}</Ltr></span>
                    {problem && (
                      <button type="button" onClick={() => cart.remove(line.cutId)} className="min-h-9 text-sm text-gold underline-offset-4 hover:underline">
                        {he.checkout.removeAndContinue}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <ReceiveLine shop={g.shop} draft={d} fee={fee} area={area} />
        </div>
      ))}

      <dl className="flex flex-col gap-1.5 border-t border-ivory/10 pt-4 text-[15px]">
        <div className="flex justify-between"><dt className="text-stone">{he.checkout.items}</dt><dd><Ltr>₪{formatAgorot(itemsTotal)}</Ltr></dd></div>
        {fees > 0 && <div className="flex justify-between"><dt className="text-stone">{he.checkout.deliveryFee}</dt><dd><Ltr>₪{formatAgorot(fees)}</Ltr></dd></div>}
        <div className="mt-1 flex items-baseline justify-between">
          <dt className="font-semibold text-ivory">{he.checkout.total}</dt>
          <dd className="font-display text-3xl font-bold text-ivory"><Ltr>₪{formatAgorot(itemsTotal + fees)}</Ltr></dd>
        </div>
      </dl>
    </div>
  );
}

function ReceiveLine({ shop, draft, fee, area }: { shop: Butcher | null; draft: ReceiveDraft; fee: number; area: string | null }) {
  if (!shop || !draft.method) return null;
  return (
    <p className="mt-1 text-center text-xs leading-relaxed text-stone">
      {draft.method === "pickup"
        ? he.checkout.pickup(shop.name, [shop.address, shop.city].filter(Boolean).join(", "), formatWeek(shop.opening_hours) || shop.pickup_hours)
        : <>{he.checkout.deliveryLabel}{area ? ` · ${draft.street.trim()}, ${area}` : ""} · {draft.window ? isolateTimes(draft.window) : he.checkout.pendingCoordination}
            {area ? <> · {he.checkout.deliveryFee} {fee ? <Ltr>₪{formatAgorot(fee)}</Ltr> : he.checkout.deliveryFeeNone}</> : null}</>}
    </p>
  );
}

function PaySheet({ hold, busy, onPay, onBack }: { hold: Hold; busy: boolean; onPay: () => void; onBack: () => void }) {
  const now = useNow(1000);
  const left = new Date(hold.expires_at).getTime() - now;
  return (
    <BottomSheet open onClose={onBack} title={he.checkout.payTitle} dark>
      <div className="flex flex-col gap-4 text-center">
        <div className="rounded-2xl bg-gold/10 px-4 py-4 ring-1 ring-gold/50">
          <p className="font-display text-xl font-bold text-gold">{he.app.prototypeBanner}</p>
          <p className="mt-1 text-sm text-ivory/75">{he.checkout.payNote}</p>
        </div>
        <p className={clsx("text-sm", left > 0 ? "text-ivory/85" : "text-[#e8a0a8]")} role="timer" aria-live="off">
          {left > 0 ? he.checkout.heldFor(formatCountdown(left)) : he.checkout.holdExpired}
        </p>
        <div>
          <p className="text-sm text-stone">{he.checkout.total}</p>
          <p className="font-display text-4xl font-bold text-ivory"><Ltr>₪{formatAgorot(hold.total_agorot)}</Ltr></p>
          {hold.fees_agorot > 0 && (
            <p className="text-xs text-stone">{he.checkout.deliveryFee} <Ltr>₪{formatAgorot(hold.fees_agorot)}</Ltr></p>
          )}
        </div>
        <Button size="xl" loading={busy} onClick={onPay}>{busy ? he.checkout.paying : he.checkout.payDemo}</Button>
        <button type="button" onClick={onBack} className="min-h-11 text-sm text-ivory/70 underline-offset-4 hover:underline">{he.checkout.editOrder}</button>
      </div>
    </BottomSheet>
  );
}
