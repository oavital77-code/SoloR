"use client";
// S2 — the parent's details, entered once (R10): the cut, breed, origin and aging as chips, the price per kg on the
// big pad (it starts at the last price for the same cut and breed), "מלא כמו הנתח הקודם" to copy the previous
// parent. It can be skipped and finished later, but nothing goes live until it is complete (R9).
// The weight of the whole cut on the scale. T5 — "איך מוכרים?": גוש / סטייקים / גם וגם, three big buttons, then the
// block's confirm or the trays board (BUTCHER_FLOW_v2 §3).
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { useButcher } from "@/components/butcher/ButcherShell";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { Keypad } from "@/components/butcher/flow/Keypad";
import { WeightInput } from "@/components/butcher/flow/WeightInput";
import { useParent } from "@/components/butcher/flow/useParent";
import { Ltr } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { parentMissing } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds } from "@/lib/hooks";
import { AGING_METHODS, CUT_TYPES, ORIGINS } from "@/lib/labels";
import { agorotToShekelsInput, shekelsToAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PARENT_DETAIL_FIELDS, type Parent, type ParentDetails, type SaleMode } from "@/lib/types";

const AGING_DAYS = [14, 21, 28, 45];
const pick = (p: Parent): ParentDetails => Object.fromEntries(PARENT_DETAIL_FIELDS.map((k) => [k, p[k]])) as ParentDetails;

export default function DetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, state, reload } = useParent(id);
  const { butcher } = useButcher();
  const breeds = useBreeds();
  const toast = useToast();
  const router = useRouter();
  const [d, setD] = useState<ParentDetails | null>(null);
  const [price, setPrice] = useState("");
  const [priceTouched, setPriceTouched] = useState(false);
  const [weight, setWeight] = useState<number | null>(null);
  const [step, setStep] = useState<"details" | "mode">("details");
  const [busy, setBusy] = useState(false);
  const [previous, setPrevious] = useState<Parent[]>([]);
  const [otherDays, setOtherDays] = useState(false);

  useEffect(() => {
    if (!parent || d) return;
    setD(pick(parent));
    setPrice(agorotToShekelsInput(parent.price_per_kg_agorot));
    setWeight(parent.weight_g);
    setOtherDays(!!parent.aging_days && !AGING_DAYS.includes(parent.aging_days));
  }, [parent, d]);

  // the shop's earlier parents: "like the previous one", and the last price for the same cut + breed
  useEffect(() => {
    supabaseBrowser().from("parents").select("*").eq("butcher_id", butcher.id).neq("id", id)
      .not("cut_type", "is", null).order("created_at", { ascending: false }).limit(40)
      .then(({ data }) => setPrevious((data ?? []) as Parent[]));
  }, [butcher.id, id]);
  const lastPrice = useMemo(() => d?.cut_type
    ? previous.find((p) => p.cut_type === d.cut_type && (p.breed_key ?? p.breed_other) === (d.breed_key ?? d.breed_other) && p.price_per_kg_agorot)?.price_per_kg_agorot ?? null
    : null, [previous, d?.cut_type, d?.breed_key, d?.breed_other]);
  useEffect(() => { if (!priceTouched && lastPrice && !price) setPrice(agorotToShekelsInput(lastPrice)); }, [lastPrice, priceTouched, price]);

  const set = (patch: Partial<ParentDetails>) => setD((x) => (x ? { ...x, ...patch } : x));
  const save = useCallback(async () => {
    if (!d) return false;
    const row = { ...d, price_per_kg_agorot: price ? shekelsToAgorot(price) : null, weight_g: weight };
    const { error } = await supabaseBrowser().from("parents").update(row).eq("id", id);
    if (error) { toast(errorText(error), { tone: "error" }); return false; }
    return true;
  }, [d, price, weight, id, toast]);

  async function next() {
    setBusy(true);
    const ok = await save();
    setBusy(false);
    if (!ok || !parent) return;
    if (parent.sale_mode == null) return setStep("mode");
    router.push(parent.sale_mode === "block" ? `/butcher/parent/${id}/block` : `/butcher/parent/${id}/units`);
  }

  async function mode(m: SaleMode) {
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("set_sale_mode", { p_parent_id: id, p_mode: m });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    router.push(m === "block" ? `/butcher/parent/${id}/block` : `/butcher/parent/${id}/units`);
  }

  if (state !== "ok" || !parent || !d) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const title = he.flow.cutNo(parent.code ?? "");

  if (step === "mode") {
    const modes: [SaleMode, string, string][] = [
      ["block", he.flow.modeBlock, he.flow.modeBlockHint],
      ["steaks", he.flow.modeSteaks, he.flow.modeSteaksHint],
      ["both", he.flow.modeBoth, he.flow.modeBothHint],
    ];
    return (
      <FlowScreen title={title} sub={he.flow.saleModeTitle} back={null}>
        <h2 className="m-0 mt-4 text-center text-[34px] font-black">{he.flow.saleModeTitle}</h2>
        {modes.map(([m, label, hint]) => (
          <button key={m} type="button" disabled={busy} onClick={() => mode(m)}
            className={clsx("sr-cbtn !min-h-[110px] !flex-col !gap-1", m === "both" ? "sr-cbtn--new" : "sr-cbtn--quiet")}>
            <span className="text-[26px]">{label}</span>
            <span className="text-sm font-semibold opacity-80">{hint}</span>
          </button>
        ))}
        <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" onClick={() => setStep("details")}>{he.flow.editDetails}</button>
      </FlowScreen>
    );
  }

  const last = previous[0];
  const missing = parentMissing(d);
  const breedList = breeds.filter((b) => !d.cut_type || !b.applies_to.length || b.applies_to.includes(d.cut_type));
  return (
    <FlowScreen title={title} sub={he.flow.detailsHint}
      footer={
        <>
          {missing.length > 0 && <p className="m-0 text-center text-sm text-stone">{he.flow.missingNote}</p>}
          <button type="button" className="sr-cbtn sr-cbtn--new" disabled={busy} onClick={next}>{he.flow.next}</button>
          {missing.length > 0 && <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" disabled={busy} onClick={next}>{he.flow.skip}</button>}
        </>
      }>
      <div className="flex flex-wrap gap-2">
      <Link href={`/butcher/parent/${id}/code`} className="sr-cchip">{he.flow.clipChange}</Link>
      <Link href={`/butcher/parent/${id}/photos`} className="sr-cchip">{he.flow.parentPhotosTitle}</Link>
      {last && (
        <button type="button" className="sr-cchip" onClick={() => {
          setD(pick(last));
          setPrice(agorotToShekelsInput(last.price_per_kg_agorot));
          setOtherDays(!!last.aging_days && !AGING_DAYS.includes(last.aging_days));
        }}>{he.flow.sameAsLast}</button>
      )}
      </div>

      <Group label={he.wizard.cutType}>
        {CUT_TYPES.map((c) => <Pill key={c.key} on={d.cut_type === c.key} onClick={() => set({ cut_type: c.key })}>{c.label}</Pill>)}
      </Group>
      <Group label={he.wizard.breed}>
        {breedList.map((b) => <Pill key={b.key} on={d.breed_key === b.key} onClick={() => set({ breed_key: b.key, breed_other: null })}>{b.label_he}</Pill>)}
        <Pill on={!d.breed_key && d.breed_other != null} onClick={() => set({ breed_key: null, breed_other: d.breed_other ?? "" })}>{he.wizard.breedOther}</Pill>
        {!d.breed_key && d.breed_other != null && (
          <input className="sr-cinput mt-1" placeholder={he.wizard.breedOtherPlaceholder} maxLength={60} value={d.breed_other}
            onChange={(e) => set({ breed_other: e.target.value })} aria-label={he.wizard.breedOther} />
        )}
      </Group>
      <Group label={he.wizard.origin}>
        {ORIGINS.map((o) => <Pill key={o.key} on={d.origin_country === o.key} onClick={() => set({ origin_country: o.key })}>{o.label}</Pill>)}
      </Group>
      <Group label={he.wizard.isAged}>
        <Pill on={d.is_aged === true} onClick={() => set({ is_aged: true })}>{he.wizard.aged}</Pill>
        <Pill on={d.is_aged === false} onClick={() => set({ is_aged: false, aging_days: null, aging_method: null })}>{he.wizard.notAged}</Pill>
      </Group>
      {d.is_aged && (
        <>
          <Group label={he.flow.agingDays}>
            {AGING_DAYS.map((n) => <Pill key={n} on={!otherDays && d.aging_days === n} onClick={() => { setOtherDays(false); set({ aging_days: n }); }}>{n}</Pill>)}
            <Pill on={otherDays} onClick={() => setOtherDays(true)}>{he.flow.otherDays}</Pill>
            {otherDays && (
              <input className="sr-cinput ltr mt-1 !w-32" inputMode="numeric" value={d.aging_days ?? ""} aria-label={he.flow.agingDays}
                onChange={(e) => { const n = Number(e.target.value.replace(/\D/g, "")); set({ aging_days: n ? Math.min(365, n) : null }); }} />
            )}
          </Group>
          <Group label={he.wizard.agingMethod}>
            {AGING_METHODS.map((m) => <Pill key={m.key} on={d.aging_method === m.key} onClick={() => set({ aging_method: d.aging_method === m.key ? null : m.key })}>{m.label}</Pill>)}
          </Group>
        </>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="sr-clabel">{he.flow.pricePerKg}</span>
          <span className="text-[34px] font-black leading-none"><Ltr>{price ? `₪${price}` : "—"}</Ltr></span>
        </div>
        {lastPrice && !priceTouched && price === agorotToShekelsInput(lastPrice) && <p className="m-0 text-xs text-stone">{he.flow.lastPrice}</p>}
        <Keypad value={price} decimal max={6} maxValue={5000} onChange={(v) => { setPriceTouched(true); setPrice(v); }} />
      </section>

      <WeightInput grams={weight} label={he.flow.parentWeight} onChange={(g) => setWeight(g)} />

      <Group label={he.wizard.marbling}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pill key={n} small on={d.butcher_marbling === n} onClick={() => set({ butcher_marbling: d.butcher_marbling === n ? null : n })}>{n}</Pill>
        ))}
      </Group>
      <label className="flex flex-col gap-1.5">
        <span className="sr-clabel">{he.wizard.description}</span>
        <textarea className="sr-cinput" maxLength={500} placeholder={he.wizard.descriptionPlaceholder} value={d.description ?? ""}
          onChange={(e) => set({ description: e.target.value || null })} />
      </label>
    </FlowScreen>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="sr-clabel mb-2">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Pill({ on, onClick, children, small }: { on: boolean; onClick: () => void; children: React.ReactNode; small?: boolean }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={clsx("sr-cchip !min-h-[52px] !text-[17px]", small && "!min-w-[52px] !px-0")}>
      {children}
    </button>
  );
}
