"use client";
// B3 — 5-step cut wizard. Drafts autosave (debounce 800ms); live cuts save on explicit confirm (SPEC §2.4).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
import { useButcher } from "./ButcherShell";
import { MediaUploader } from "./MediaUploader";
import { CutDetail } from "../CutDetail";
import { PurchaseBar } from "../PurchaseBar";
import { useToast } from "../Toast";
import { Button, Chip, ConfirmDialog, ErrorState, Field, Ltr, Spinner, Stepper, inputClass } from "../ui";
import { he } from "@/lib/i18n/he";
import { AGING_METHODS, CUT_TYPES, ORIGINS, SALE_MODES } from "@/lib/labels";
import { asLive, FIELD_STEP, missingFields, photosOf } from "@/lib/cut-helpers";
import { errorCode, errorText, missingFieldsOf } from "@/lib/errors";
import { safeStorage, useBreeds } from "@/lib/hooks";
import {
  agorotToShekelsInput, formatAgorot, maxSteaks, plannedSteaks, shekelsToAgorot, steakPrice, wholePrice,
} from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { removeStorageObjects } from "@/lib/upload";
import { ALWAYS_EDITABLE, CUT_CONTENT_FIELDS, type Cut, type CutContent, type CutContentField, type CutMedia } from "@/lib/types";

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";
const STOCK_FIELDS: CutContentField[] = ["weight_g", "sale_mode", "steak_weight_g", "steaks_planned"];

function pickContent(c: Cut): CutContent {
  const out = {} as Record<string, unknown>;
  CUT_CONTENT_FIELDS.forEach((f) => { out[f] = c[f]; });
  return out as unknown as CutContent;
}

function diff(a: CutContent, b: CutContent): Partial<CutContent> {
  const out: Partial<CutContent> = {};
  CUT_CONTENT_FIELDS.forEach((f) => {
    if (a[f] !== b[f]) (out as Record<string, unknown>)[f] = a[f];
  });
  return out;
}

export function CutWizard({ cutId }: { cutId: string }) {
  const { butcher } = useButcher();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const breeds = useBreeds();
  const step = Math.min(5, Math.max(1, Number(params.get("step")) || 1));

  const [cut, setCut] = useState<Cut | null>(null);
  const [media, setMedia] = useState<CutMedia[]>([]);
  const [form, setForm] = useState<CutContent | null>(null);
  const savedRef = useRef<CutContent | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState(false);
  const [activeOrders, setActiveOrders] = useState(0);
  const [stockTouched, setStockTouched] = useState(false);
  const [published, setPublished] = useState(false);

  const isDraft = cut?.status === "draft";

  // ── load ──
  const loadMedia = useCallback(async () => {
    const { data } = await supabaseBrowser().from("cut_media").select("*").eq("cut_id", cutId);
    setMedia((data ?? []) as CutMedia[]);
  }, [cutId]);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: c, error }, { data: orders }, { count: storeSales }] = await Promise.all([
      sb.from("cuts").select("*, cut_media(*)").eq("id", cutId).maybeSingle(),
      sb.from("order_items").select("status, orders(status)").eq("cut_id", cutId),
      sb.from("stock_events").select("id", { count: "exact", head: true }).eq("cut_id", cutId).eq("type", "store_sale"),
    ]);
    if (error || !c) return setLoadError(true);
    const { cut_media, ...rest } = c as Cut & { cut_media: CutMedia[] };
    setCut(rest);
    setMedia(cut_media);
    const content = pickContent(rest);
    setForm(content);
    savedRef.current = content;
    const lines = (orders ?? []) as unknown as { status: string; orders: { status: string } | null }[];
    const sold = lines.filter((l) => l.status === "active");
    setActiveOrders(sold.filter((l) => ["new", "preparing", "ready"].includes(l.orders?.status ?? "")).length);
    setStockTouched(sold.length > 0 || (storeSales ?? 0) > 0 || rest.status !== "published");
  }, [cutId]);

  useEffect(() => { load(); }, [load]);

  // ── saving ──
  const save = useCallback(async (): Promise<boolean> => {
    if (!form || !savedRef.current) return true;
    const changes = diff(form, savedRef.current);
    if (Object.keys(changes).length === 0) { setSaveState((s) => (s === "pending" ? "saved" : s)); return true; }
    setSaveState("saving");
    const { data, error } = await supabaseBrowser().from("cuts").update(changes).eq("id", cutId).select("*").single();
    if (error) {
      setSaveState("error");
      if (!isDraft) toast(errorText(error), { tone: "error" });
      return false;
    }
    savedRef.current = { ...savedRef.current, ...changes };
    setCut(data as Cut);
    setSaveState("saved");
    return true;
  }, [form, cutId, isDraft, toast]);

  // drafts: autosave with 800ms debounce
  useEffect(() => {
    if (!isDraft || !form || !savedRef.current) return;
    if (Object.keys(diff(form, savedRef.current)).length === 0) return;
    setSaveState("pending");
    const t = window.setTimeout(() => { save(); }, 800);
    return () => window.clearTimeout(t);
  }, [form, isDraft, save]);

  const dirty = !!form && !!savedRef.current && Object.keys(diff(form, savedRef.current)).length > 0;

  // warn before leaving with unsaved live edits
  useEffect(() => {
    if (isDraft || !dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, isDraft]);

  const set = useCallback(<K extends CutContentField>(k: K, v: CutContent[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
  }, []);

  // ── locks for live cuts (SPEC §6.5) ──
  const locked = useCallback((f: CutContentField) => {
    if (!cut || cut.status === "draft") return false;
    if (cut.status === "withdrawn") return true;
    if (ALWAYS_EDITABLE.includes(f)) return false;
    if (activeOrders > 0) return true;
    if (STOCK_FIELDS.includes(f) && stockTouched) return true;
    return false;
  }, [cut, activeOrders, stockTouched]);

  const goStep = (n: number) => router.replace(`/butcher/cuts/${cutId}/edit?step=${n}`, { scroll: true });

  if (loadError) return <ErrorState onRetry={() => { setLoadError(false); load(); }} />;
  if (!cut || !form) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  if (published) return <PublishedScreen code={cut.code} />;

  const merged: Cut = { ...cut, ...form };
  const photoCount = media.filter((m) => m.type === "photo").length;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-neutral-50/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <Link href={isDraft ? "/butcher" : `/butcher/cuts/${cutId}`} className="flex min-h-11 items-center px-1 text-sm font-semibold text-neutral-600">
            {he.app.close}
          </Link>
          <h1 className="flex-1 text-lg font-extrabold">
            {isDraft ? he.wizard.newTitle : he.wizard.editTitle(cut.code)} {isDraft && <Ltr className="text-sm font-semibold text-neutral-500">{cut.code}</Ltr>}
          </h1>
          {isDraft ? <SaveIndicator state={saveState} onRetry={save} />
            : dirty ? <span className="text-sm font-semibold text-amber-700">{he.wizard.unsavedChanges}</span> : null}
        </div>
        <ol className="mt-3 grid grid-cols-5 gap-1.5" aria-label={he.a11y.steps}>
          {he.wizard.steps.map((label, i) => (
            <li key={label}>
              <button type="button" onClick={() => goStep(i + 1)} className="flex w-full flex-col items-center gap-1" aria-current={step === i + 1 ? "step" : undefined}>
                <span className={clsx("h-1.5 w-full rounded-full", i + 1 <= step ? "bg-brand" : "bg-neutral-300")} />
                <span className={clsx("text-xs", step === i + 1 ? "font-extrabold text-neutral-900" : "text-neutral-500")}>{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </header>

      {!isDraft && cut.status !== "withdrawn" && (
        <div className="mx-4 mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
          {he.wizard.liveEditNote}
          {activeOrders > 0 && <p className="mt-1">{he.wizard.lockedActive}</p>}
          {activeOrders === 0 && stockTouched && <p className="mt-1">{he.wizard.lockedStock}</p>}
        </div>
      )}

      <div className="flex-1 px-4 py-5">
        {step === 1 && (
          <MediaUploader cutId={cutId} butcherId={butcher.id} media={media} onChange={loadMedia} disabled={cut.status === "withdrawn"} />
        )}
        {step === 2 && <StepWhat form={form} set={set} locked={locked} breeds={breeds} />}
        {step === 3 && <StepAging form={form} set={set} locked={locked} />}
        {step === 4 && <StepWeight form={form} set={set} locked={locked} />}
        {step === 5 && (
          <StepPreview
            cut={merged} media={media} photoCount={photoCount} breeds={breeds} goStep={goStep}
            isDraft={isDraft} save={save} onPublished={() => setPublished(true)}
          />
        )}
      </div>

      <footer className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-neutral-200 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {!isDraft && dirty && (
          <Button size="lg" loading={saveState === "saving"} onClick={async () => {
            if (await save()) { toast(he.wizard.changesSaved, { tone: "success" }); load(); }
          }}>
            {he.wizard.saveChanges}
          </Button>
        )}
        <div className="flex gap-2">
          <Button size="lg" variant="secondary" className="flex-1" disabled={step === 1} onClick={() => goStep(step - 1)}>
            {he.wizard.prev}
          </Button>
          {step < 5 && (
            <Button size="lg" className="flex-1" onClick={() => goStep(step + 1)}>
              {he.wizard.next}
            </Button>
          )}
        </div>
      </footer>
    </main>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="flex min-h-11 items-center gap-1 text-sm font-bold text-red-700">
        {he.wizard.saveError}
      </button>
    );
  }
  if (state === "saved") return <span className="text-sm font-semibold text-emerald-700" role="status">{he.wizard.saved}</span>;
  return <span className="text-sm text-neutral-500" role="status">{he.wizard.saving}…</span>;
}

type StepProps = {
  form: CutContent;
  set: <K extends CutContentField>(k: K, v: CutContent[K]) => void;
  locked: (f: CutContentField) => boolean;
};

function StepWhat({ form, set, locked, breeds }: StepProps & { breeds: ReturnType<typeof useBreeds> }) {
  const visibleBreeds = breeds.filter((b) => b.applies_to.length === 0 || (form.cut_type && b.applies_to.includes(form.cut_type)));
  const otherSelected = form.breed_key == null && form.breed_other != null;
  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.cutType}</h2>
        <div className="grid grid-cols-2 gap-2">
          {CUT_TYPES.map((c) => (
            <Chip key={c.key} selected={form.cut_type === c.key} disabled={locked("cut_type")}
              onClick={() => set("cut_type", c.key)} className="min-h-14 text-lg">
              {c.label}
            </Chip>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.breed}</h2>
        {!form.cut_type ? (
          <p className="text-neutral-500">{he.wizard.pickCutFirst}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {visibleBreeds.map((b) => (
                <Chip key={b.key} selected={form.breed_key === b.key} disabled={locked("breed_key")} className="min-h-14 text-lg"
                  onClick={() => { set("breed_key", b.key); set("breed_other", null); }}>
                  {b.label_he}
                </Chip>
              ))}
              <Chip selected={otherSelected} disabled={locked("breed_key")} className="min-h-14 text-lg"
                onClick={() => { set("breed_key", null); set("breed_other", form.breed_other ?? ""); }}>
                {he.wizard.breedOther}
              </Chip>
            </div>
            {otherSelected && (
              <input
                className={inputClass} placeholder={he.wizard.breedOtherPlaceholder} maxLength={60} autoFocus
                aria-label={he.wizard.breedOtherPlaceholder} disabled={locked("breed_other")}
                value={form.breed_other ?? ""} onChange={(e) => set("breed_other", e.target.value)}
              />
            )}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.origin}</h2>
        <div className="grid grid-cols-2 gap-2">
          {ORIGINS.map((o) => (
            <Chip key={o.key} selected={form.origin_country === o.key} disabled={locked("origin_country")}
              onClick={() => set("origin_country", o.key)} className="min-h-14 text-lg">
              {o.label}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

function StepAging({ form, set, locked }: StepProps) {
  const [daysText, setDaysText] = useState(form.aging_days?.toString() ?? "");
  const [daysError, setDaysError] = useState<string | null>(null);
  const onDays = (t: string) => {
    const clean = t.replace(/\D/g, "").slice(0, 3);
    setDaysText(clean);
    if (!clean) { setDaysError(null); return set("aging_days", null); }
    const n = Number(clean);
    if (n >= 1 && n <= 365) { setDaysError(null); set("aging_days", n); } else setDaysError("1–365");
  };
  return (
    <div className="flex flex-col gap-7">
      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.isAged}</h2>
        <div className="grid grid-cols-2 gap-2">
          <Chip selected={form.is_aged === true} disabled={locked("is_aged")} className="min-h-14 text-lg" onClick={() => set("is_aged", true)}>{he.app.yes}</Chip>
          <Chip selected={form.is_aged === false} disabled={locked("is_aged")} className="min-h-14 text-lg"
            onClick={() => { set("is_aged", false); set("aging_days", null); set("aging_method", null); setDaysText(""); }}>
            {he.app.no}
          </Chip>
        </div>
      </section>

      {form.is_aged && (
        <>
          <Field label={he.wizard.agingDays} htmlFor="days" error={daysError}>
            <div className="flex flex-wrap gap-2">
              {[14, 21, 28, 45].map((d) => (
                <Chip key={d} selected={form.aging_days === d} disabled={locked("aging_days")} onClick={() => onDays(String(d))} className="min-w-16 text-lg">
                  <Ltr>{d}</Ltr>
                </Chip>
              ))}
            </div>
            <input id="days" inputMode="numeric" className={inputClass} disabled={locked("aging_days")}
              value={daysText} onChange={(e) => onDays(e.target.value)} />
          </Field>
          <section>
            <h2 className="mb-3 font-bold">{he.wizard.agingMethod}</h2>
            <div className="grid grid-cols-2 gap-2">
              {AGING_METHODS.map((m) => (
                <Chip key={m.key} selected={form.aging_method === m.key} disabled={locked("aging_method")} className="min-h-14 text-lg"
                  onClick={() => set("aging_method", form.aging_method === m.key ? null : m.key)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.marbling}</h2>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Chip key={n} selected={form.butcher_marbling === n} onClick={() => set("butcher_marbling", n)} className="min-h-12 px-0 text-lg">
              <Ltr>{n}</Ltr>
            </Chip>
          ))}
        </div>
        <Chip selected={form.butcher_marbling == null} onClick={() => set("butcher_marbling", null)} className="mt-2 w-full">{he.app.none}</Chip>
      </section>

      <Field label={he.wizard.description} htmlFor="desc" hint={`${form.description?.length ?? 0}/500`}>
        <textarea id="desc" rows={4} maxLength={500} placeholder={he.wizard.descriptionPlaceholder}
          className={inputClass + " py-3"} value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)} />
      </Field>
    </div>
  );
}

function StepWeight({ form, set, locked }: StepProps) {
  const [weightText, setWeightText] = useState(form.weight_g?.toString() ?? "");
  const [priceText, setPriceText] = useState(agorotToShekelsInput(form.price_per_kg_agorot));
  const [weightError, setWeightError] = useState<string | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);

  const onWeight = (t: string) => {
    const clean = t.replace(/\D/g, "").slice(0, 5);
    setWeightText(clean);
    if (!clean) { setWeightError(null); return set("weight_g", null); }
    const n = Number(clean);
    if (n >= 100 && n <= 20000) {
      setWeightError(null);
      set("weight_g", n);
      // the chosen steak count can only lower the max — reset if it no longer fits
      if (form.steaks_planned != null && form.steaks_planned >= maxSteaks(n, form.steak_weight_g)) set("steaks_planned", null);
    } else setWeightError(he.wizard.weightRange);
  };
  const onPrice = (t: string) => {
    setPriceText(t);
    if (!t.trim()) { setPriceError(null); return set("price_per_kg_agorot", null); }
    const a = shekelsToAgorot(t);
    if (a != null && a >= 100 && a <= 500000) { setPriceError(null); set("price_per_kg_agorot", a); }
    else setPriceError(he.wizard.priceRange);
  };

  const hasSteaks = form.sale_mode === "steaks" || form.sale_mode === "both";
  const steakW = form.steak_weight_g ?? 300;
  const mx = maxSteaks(form.weight_g, steakW);
  const planned = plannedSteaks(form.weight_g, steakW, form.steaks_planned);
  const ppk = form.price_per_kg_agorot;

  // choosing steaks sets the default steak weight (300g) so the slider value is saved
  const onSaleMode = (m: NonNullable<CutContent["sale_mode"]>) => {
    set("sale_mode", m);
    if ((m === "steaks" || m === "both") && form.steak_weight_g == null) set("steak_weight_g", 300);
  };

  const summary = he.wizard.summary(
    ppk && form.weight_g && form.sale_mode !== "steaks" && form.sale_mode ? formatAgorot(wholePrice(form.weight_g, ppk)) : null,
    ppk && hasSteaks ? formatAgorot(steakPrice(steakW, ppk)) : null,
    hasSteaks && form.weight_g ? planned : null,
  );

  return (
    <div className="flex flex-col gap-7 pb-24">
      <Field label={he.wizard.weight} htmlFor="weight" error={weightError}>
        <input id="weight" inputMode="numeric" dir="ltr" className={inputClass + " text-end text-2xl font-bold"} disabled={locked("weight_g")}
          value={weightText} onChange={(e) => onWeight(e.target.value)} placeholder="2400" />
      </Field>
      <Field label={he.wizard.price} htmlFor="price" error={priceError}>
        <input id="price" inputMode="decimal" dir="ltr" className={inputClass + " text-end text-2xl font-bold"} disabled={locked("price_per_kg_agorot")}
          value={priceText} onChange={(e) => onPrice(e.target.value)} placeholder="220" />
      </Field>

      <section>
        <h2 className="mb-3 text-xl font-extrabold">{he.wizard.saleMode}</h2>
        <div className="grid grid-cols-3 gap-2">
          {SALE_MODES.map((m) => (
            <Chip key={m.key} selected={form.sale_mode === m.key} disabled={locked("sale_mode")}
              onClick={() => onSaleMode(m.key)} className="min-h-16 px-2 text-lg">
              {m.label}
            </Chip>
          ))}
        </div>
      </section>

      {hasSteaks && (
        <>
          <section className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">{he.wizard.steakWeight}</h2>
              <span className="text-4xl font-extrabold text-brand"><Ltr>{steakW}</Ltr> <span className="text-base text-neutral-500">{he.wizard.grams}</span></span>
            </div>
            <input
              type="range" className="big-range mt-2" dir="ltr" min={150} max={1000} step={10} value={steakW}
              aria-label={he.wizard.steakWeight} disabled={locked("steak_weight_g")}
              onChange={(e) => {
                const v = Number(e.target.value);
                set("steak_weight_g", v);
                if (form.steaks_planned != null && form.steaks_planned >= maxSteaks(form.weight_g, v)) set("steaks_planned", null);
              }}
            />
            <div className="flex justify-between text-xs text-neutral-500" dir="ltr"><span>150</span><span>1000</span></div>
          </section>

          <section className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold">{he.wizard.thickness}</h2>
              <span className="text-2xl font-extrabold">
                {form.steak_thickness_cm ? <><Ltr>{Number(form.steak_thickness_cm)}</Ltr> <span className="text-sm text-neutral-500">{he.units.cm}</span></> : he.app.none}
              </span>
            </div>
            <input
              type="range" className="big-range mt-2" dir="ltr" min={1} max={8} step={0.5}
              value={form.steak_thickness_cm ?? 3} aria-label={he.wizard.thickness} disabled={locked("steak_thickness_cm")}
              onChange={(e) => set("steak_thickness_cm", Number(e.target.value))}
            />
            {form.steak_thickness_cm != null && (
              <button type="button" className="min-h-11 text-sm font-semibold text-neutral-500 underline" disabled={locked("steak_thickness_cm")}
                onClick={() => set("steak_thickness_cm", null)}>{he.app.none}</button>
            )}
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
            <div>
              <h2 className="font-bold">{he.wizard.steaksCount}</h2>
              <p className="text-sm text-neutral-500">{mx > 0 ? he.wizard.steaksMax(mx) : form.weight_g ? he.wizard.noSteaksFit : ""}</p>
            </div>
            {mx > 0 && (
              <Stepper size="lg" value={planned} min={1} max={mx} label={he.wizard.steaksCount}
                onChange={(v) => !locked("steaks_planned") && set("steaks_planned", v >= mx ? null : v)} />
            )}
          </section>
        </>
      )}

      {summary && (
        <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 mx-auto max-w-[480px] px-3">
          <div className="rounded-2xl bg-neutral-900 px-4 py-3 text-center font-bold text-white shadow-lg" aria-live="polite">{summary}</div>
        </div>
      )}
    </div>
  );
}

function StepPreview({ cut, media, photoCount, breeds, goStep, isDraft, save, onPublished }: {
  cut: Cut; media: CutMedia[]; photoCount: number; breeds: ReturnType<typeof useBreeds>;
  goStep: (n: number) => void; isDraft: boolean; save: () => Promise<boolean>; onPublished: () => void;
}) {
  const router = useRouter();
  const { butcher } = useButcher();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverMissing, setServerMissing] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function deleteDraft() {
    setBusy(true);
    const { error } = await supabaseBrowser().from("cuts").delete().eq("id", cut.id);
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    removeStorageObjects(media.flatMap((m) => [m.storage_path, m.thumb_path, m.poster_path])).catch(() => {});
    router.replace("/butcher");
  }
  const missing = useMemo(() => {
    const local = missingFields(cut, photoCount);
    return Array.from(new Set([...local, ...serverMissing.filter((f) => local.includes(f))]));
  }, [cut, photoCount, serverMissing]);
  const live = asLive(cut);

  async function publish() {
    setBusy(true);
    if (!(await save())) { setBusy(false); setConfirm(false); return toast(he.wizard.saveError, { tone: "error" }); }
    const { error } = await supabaseBrowser().rpc("publish_cut", { p_cut_id: cut.id });
    setBusy(false);
    setConfirm(false);
    if (error) {
      if (errorCode(error) === "MISSING_FIELDS") setServerMissing(missingFieldsOf(error));
      return toast(errorText(error), { tone: "error" });
    }
    onPublished();
  }

  return (
    <div className="-mx-4 -my-5 flex flex-col">
      <div className="bg-amber-400 px-4 py-2 text-center font-extrabold text-amber-950">{he.cut.previewBar}</div>
      <div className="pointer-events-auto">
        <CutDetail cut={live} media={media} breeds={breeds} butcher={butcher} />
        <PurchaseBar cut={live} preview inline />
      </div>

      <div className="flex flex-col gap-3 bg-neutral-50 px-4 py-5">
        {missing.length > 0 && (
          <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200" role="alert">
            <p className="mb-2 font-extrabold text-red-800">{he.wizard.missingTitle}</p>
            <ul className="flex flex-col gap-1">
              {missing.map((f) => (
                <li key={f}>
                  <button type="button" onClick={() => goStep(FIELD_STEP[f] ?? 1)} className="min-h-11 font-semibold text-red-700 underline underline-offset-4">
                    {he.missingFields[f] ?? f}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isDraft && (
          <>
            <Button size="xl" disabled={missing.length > 0 || photosOf(media).length === 0} onClick={() => setConfirm(true)}>
              {he.wizard.publish}
            </Button>
            <Button size="lg" variant="secondary" onClick={async () => { await save(); safeStorage.set("solor.butcher.cutFilter", "draft"); router.push("/butcher"); }}>
              {he.wizard.saveDraft}
            </Button>
            <Button variant="ghost" className="mt-4 text-red-700" onClick={() => setConfirmDelete(true)}>
              {he.cutManage.deleteDraft}
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm} text={he.wizard.publishConfirm(cut.code)} confirmLabel={he.wizard.publish}
        loading={busy} onConfirm={publish} onCancel={() => setConfirm(false)}
      />
      <ConfirmDialog
        open={confirmDelete} danger text={he.cutManage.deleteConfirm} confirmLabel={he.cutManage.deleteDraft}
        loading={busy} onConfirm={deleteDraft} onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function PublishedScreen({ code }: { code: string }) {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="h-px w-12 bg-neutral-900" aria-hidden />
      <h1 className="font-display text-4xl font-bold">{he.wizard.published}</h1>
      <Ltr className="text-lg text-neutral-500">{code}</Ltr>
      <div className="flex w-full flex-col gap-3">
        <Button size="xl" onClick={() => router.push("/butcher/cuts/new")}>{he.wizard.anotherCut}</Button>
        <Button size="lg" variant="secondary" onClick={() => router.push("/butcher")}>{he.wizard.toMyCuts}</Button>
      </div>
    </main>
  );
}
