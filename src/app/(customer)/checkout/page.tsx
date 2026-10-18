"use client";
// Checkout (customer spec §10): contact details → how each shop's part is received (only what the shop turned
// on; with delivery off nothing about delivery shows) → a binding summary → an atomic stock check that holds the
// whole cart for a few minutes → the payment, which in the prototype is a confirmation ("לא יבוצע חיוב").
// A line that cannot be held is explained, with a way to remove it and go on; nothing is swapped for another cut.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ScreenHead } from "@/components/customer/market-ui";
import { IconStore, IconTruck } from "@/components/icons";
import { ShopMark } from "@/components/ShopMark";
import { useCartRows, type ShopGroup } from "@/components/customer/useCartRows";
import { useToast } from "@/components/Toast";
import { BottomSheet, EmptyState, ErrorState, Field, Ltr, Skeleton, Spinner, inputDarkClass } from "@/components/ui";
import { cart } from "@/lib/cart";
import { deliveryArea, deliveryFee, formatCountdown, receiveOptions } from "@/lib/checkout";
import { coverOf, cutTitle, mediaUrl } from "@/lib/cut-helpers";
import { cartProblemsOf, errorCode, errorText, type CartProblem } from "@/lib/errors";
import { formatWeek, isolateTimes } from "@/lib/hours";
import { he } from "@/lib/i18n/he";
import { useBreeds, useNow, useSession } from "@/lib/hooks";
import { money } from "@/lib/pricing";
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
    <main className="min-h-dvh px-4 text-start lg:mx-auto lg:w-full lg:max-w-[760px]">
      <ScreenHead title={he.checkout.title} back="/cart" backLabel={he.checkout.backToCart} />
      <Steps current={step} />

      {lines.length === 0 ? (
        <EmptyState text={he.checkout.empty}>
          <Link href="/" className="sr-btn">{he.cart.toMarket}</Link>
        </EmptyState>
      ) : error && !cuts ? <ErrorState dark onRetry={load} />
        : !cuts ? <div className="flex flex-col gap-3 pt-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}</div>
        : (
          <>
          <div className="flex flex-col gap-7 pt-6 pb-6">
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
              <div className="flex flex-col gap-3.5">
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
                <div className="mt-4 rounded-2xl p-4 ring-1 ring-sold/40" role="alert">
                  <p className="m-0 font-semibold text-sold">{he.checkout.unavailableTitle}</p>
                  <p className="m-0 mt-1 text-sm text-ivory/70">{he.checkout.unavailableHint}</p>
                </div>
              )}
              <p className="sr-legal m-0 mt-3">{he.cut.weightRuleShort}</p>
            </Section>
          </div>

          <div className="sticky bottom-0 z-20 -mx-4 flex flex-col gap-2.5 border-t border-line bg-ink px-4 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {tried && !ready && !blocked && <p className="m-0 text-center text-[13px] font-semibold text-sold" role="alert">{he.checkout.fixDetails}</p>}
            <button type="button" className="sr-btn sr-btn--block" disabled={blocked || busy} onClick={reserve}>
              {busy && !hold ? he.checkout.reserving : <>{he.checkout.reserve} · <Ltr>{money(itemsTotal + fees)}</Ltr></>}
            </button>
            <span className="text-center text-xs text-stone">
              {he.checkout.holdNote} · <span className="font-semibold text-gold">{he.app.prototypeBanner}</span>
            </span>
          </div>
          </>
        )}

      {hold && <PaySheet hold={hold} busy={busy} onPay={pay} onBack={back} parts={parts} breeds={breeds} />}
    </main>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol className="sr-steps4 m-0 mt-4 list-none p-0" aria-label={he.checkout.title}>
      {he.checkout.steps.map((st, i) => (
        <div key={st} role="listitem" aria-current={i === current ? "step" : undefined} className={clsx(i <= current && "on")}>{st}</div>
      ))}
    </ol>
  );
}

function Section({ title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <span className="sr-eyebrow">{title}</span>
      {hint && <p className="-mt-1.5 m-0 text-xs text-stone">{hint}</p>}
      <div>{children}</div>
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
    <div className="sr-card !border-line-gold">
      <div className="flex items-center gap-2.5">
        <ShopMark shop={shop} size="sm" />
        <span className="flex-1 font-display text-lg font-semibold">{shop.name}</span>
        {many && <Ltr className="text-stone">{money(group.rows.reduce((t, r) => t + (r.problem ? 0 : r.price), 0))}</Ltr>}
      </div>
      {options.length === 0 ? (
        <p className="m-0 text-sm text-sold" role="alert">{he.checkout.noReceive}</p>
      ) : (
        <>
          <div className="sr-seg" role="radiogroup" aria-label={he.checkout.receiveMethod}>
            {(["pickup", "delivery"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={draft.method === m} disabled={!options.includes(m)}
                onClick={() => onChange({ method: m })}>
                {m === "pickup" ? <IconStore className="!size-[18px]" /> : <IconTruck className="!size-[18px]" />}
                {m === "pickup" ? he.checkout.pickupLabel : options.includes(m) ? he.checkout.deliveryLabel : he.checkout.noDelivery}
              </button>
            ))}
          </div>

          {draft.method === "pickup" ? (
            <dl className="m-0 flex flex-col gap-2 text-[15px]">
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
              <p className="m-0 text-xs text-stone">{he.checkout.recipientHint}</p>
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
              <div className="flex flex-col gap-2">
                <p className="m-0 text-[13px] text-stone">{he.checkout.window}</p>
                {shop.delivery_windows.length ? (
                  <div className="sr-chips">
                    {shop.delivery_windows.map((w) => (
                      <button key={w} type="button" aria-pressed={draft.window === w} onClick={() => onChange({ window: draft.window === w ? null : w })}
                        className="sr-fchip">
                        {isolateTimes(w)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {!draft.window && <p className="m-0 text-[13px] text-stone">{he.checkout.pendingCoordination}</p>}
              </div>
              {area && (
                <p className="m-0 text-sm text-ivory/80">
                  {he.checkout.deliveryFee}: {fee ? <Ltr>{money(fee)}</Ltr> : he.checkout.deliveryFeeNone}
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="m-0 text-sm text-sold" role="alert">{error}</p>}
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-stone">{he.cart.noteFor(shop.name)}</span>
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
    <div className="flex flex-col gap-4">
      {parts.map(({ g, d, fee, area }) => (
        <div key={g.butcherId}>
          <p className="m-0 font-display text-[17px] font-semibold">{g.shop?.name}</p>
          <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-line p-0">
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
                    {problem && <p className="m-0 mt-0.5 text-xs font-semibold text-sold" role="alert">{problem}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end">
                    <span className={clsx("font-semibold", problem ? "text-stone line-through" : "text-ivory")}><Ltr>{money(price)}</Ltr></span>
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

      <dl className="m-0 flex flex-col gap-2.5">
        <div className="sr-rowline"><dt>{he.checkout.items}</dt><dd className="m-0"><Ltr>{money(itemsTotal)}</Ltr></dd></div>
        {parts.filter((p) => p.fee > 0).map((p) => (
          <div key={p.g.butcherId} className="sr-rowline"><dt>{he.checkout.deliveryFee} · {p.g.shop?.name}</dt><dd className="m-0"><Ltr>{money(p.fee)}</Ltr></dd></div>
        ))}
        <div className="h-px bg-line" />
        <div className="sr-rowline !text-lg !font-bold"><dt>{he.checkout.total}</dt><dd className="m-0"><Ltr>{money(itemsTotal + fees)}</Ltr></dd></div>
      </dl>
    </div>
  );
}

function ReceiveLine({ shop, draft, fee, area }: { shop: Butcher | null; draft: ReceiveDraft; fee: number; area: string | null }) {
  if (!shop || !draft.method) return null;
  return (
    <p className="m-0 mt-1 text-xs leading-relaxed text-stone">
      {draft.method === "pickup"
        ? he.checkout.pickup(shop.name, [shop.address, shop.city].filter(Boolean).join(", "), formatWeek(shop.opening_hours) || shop.pickup_hours)
        : <>{he.checkout.deliveryLabel}{area ? ` · ${draft.street.trim()}, ${area}` : ""} · {draft.window ? isolateTimes(draft.window) : he.checkout.pendingCoordination}
            {area ? <> · {he.checkout.deliveryFee} {fee ? <Ltr>{money(fee)}</Ltr> : he.checkout.deliveryFeeNone}</> : null}</>}
    </p>
  );
}

/** The hold (design: Reserve): the cuts are kept for this customer alone while a gold ring counts down — red in the
 * last minute — then each line, the delivery, the total, the weight rule and the one button. */
function PaySheet({ hold, busy, onPay, onBack, parts, breeds }: {
  hold: Hold; busy: boolean; onPay: () => void; onBack: () => void;
  parts: { g: ShopGroup; fee: number }[]; breeds: Breed[];
}) {
  const now = useNow(1000);
  const left = new Date(hold.expires_at).getTime() - now;
  const span = new Date(hold.expires_at).getTime() - new Date(hold.created_at).getTime();
  const p = span > 0 ? Math.max(0, Math.min(1, left / span)) : 0;
  const late = left < 60_000;
  return (
    <BottomSheet open onClose={onBack} dark>
      <div className="flex flex-col gap-4 text-start">
        <div className="flex flex-col items-center gap-1 text-center">
          <h2 className="sr-sheet__title">{he.checkout.heldTitle}</h2>
          <span className="text-sm text-stone">{he.checkout.heldSub}</span>
        </div>
        <div className={clsx("sr-timer-ring", late && "sr-timer-ring--late")} style={{ "--p": p } as React.CSSProperties} role="timer" aria-live="off">
          <div><span className="sr-timer">{left > 0 ? formatCountdown(left) : "0:00"}</span></div>
        </div>
        {left <= 0 && <p className="m-0 text-center text-sm text-sold">{he.checkout.holdExpired}</p>}
        <div className="flex flex-col gap-2.5">
          {parts.flatMap(({ g }) => g.rows.filter((r) => !r.problem).map(({ line, cut, price }) => (
            <div key={line.cutId} className="sr-rowline">
              <span>{cut ? cutTitle(cut, breeds).split(" · ")[0] : line.code} · {line.mode === "whole" ? he.cut.whole : he.cut.steaksCount(line.qty ?? 1)} · <span className="code">{line.code}</span></span>
              <Ltr>{money(price)}</Ltr>
            </div>
          )))}
          {parts.filter((x) => x.fee > 0).map((x) => (
            <div key={x.g.butcherId} className="sr-rowline text-stone"><span>{he.checkout.deliveryLabel} · {x.g.shop?.name}</span><Ltr>{money(x.fee)}</Ltr></div>
          ))}
          <div className="sr-rowline border-t border-line pt-3 !text-lg !font-bold"><span>{he.checkout.total}</span><Ltr>{money(hold.total_agorot)}</Ltr></div>
        </div>
        <p className="sr-legal m-0">{he.cut.weightRuleShort}</p>
        <button type="button" className="sr-btn sr-btn--block" disabled={busy} onClick={onPay}>
          {busy ? he.checkout.paying : <>{he.checkout.payConfirm} · <Ltr>{money(hold.total_agorot)}</Ltr></>}
        </button>
        <span className="sr-proto self-center">{he.app.prototypeBanner}</span>
        <button type="button" onClick={onBack} className="min-h-11 self-center text-sm text-stone underline-offset-4 hover:underline">{he.checkout.editOrder}</button>
      </div>
    </BottomSheet>
  );
}
