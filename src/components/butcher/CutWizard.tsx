"use client";
// B3 — the cut form (design: CounterNew): one page — the photo in its framing guide, what the cut is, aging,
// weight and price, the marbling scale and a word from the butcher — then a preview that publishes. Drafts
// autosave (debounce 800ms); live cuts save on explicit confirm (SPEC §2.4). ?step=5 is the preview; ?step=1–4
// opens the form at that section (the "missing" links jump there).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useButcher } from "./ButcherShell";
import { MediaUploader } from "./MediaUploader";
import { CutDetail } from "../CutDetail";
import { PurchaseBar } from "../PurchaseBar";
import { useToast } from "../Toast";
import { Chip, ConfirmDialog, ErrorState, Ltr, Spinner, Stepper, inputClass } from "../ui";
import { IconCheck } from "../icons";
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
  const preview = step === 5;

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

  const goStep = (n: number) => router.replace(`/butcher/cuts/${cutId}/edit?step=${n}`, { scroll: n === 5 });

  if (loadError) return <ErrorState onRetry={() => { setLoadError(false); load(); }} />;
  if (!cut || !form) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  if (published) return <PublishedScreen code={cut.code} />;

  const merged: Cut = { ...cut, ...form };
  const photoCount = media.filter((m) => m.type === "photo").length;

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-ink/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="m-0 font-display text-[26px] font-bold">{preview ? he.wizard.previewTitle : isDraft ? he.wizard.newTitle : he.wizard.editTitle(cut.code)}</h1>
          {isDraft && <span className="code">{cut.code}</span>}
        </div>
        <div className="flex items-center gap-3">
          {isDraft ? <SaveIndicator state={saveState} onRetry={save} />
            : dirty ? <span className="text-sm font-semibold text-gold">{he.wizard.unsavedChanges}</span> : null}
          {preview
            ? <button type="button" onClick={() => goStep(1)} className="flex min-h-11 items-center font-semibold text-stone">{he.wizard.backToForm}</button>
            : <Link href={isDraft ? "/butcher" : `/butcher/cuts/${cutId}`} className="flex min-h-11 items-center font-semibold text-stone">{he.app.cancel}</Link>}
        </div>
      </header>

      {!isDraft && cut.status !== "withdrawn" && !preview && (
        <div className="mx-4 mt-2 rounded-2xl bg-gold-soft p-3 text-sm font-semibold">
          {he.wizard.liveEditNote}
          {activeOrders > 0 && <p className="m-0 mt-1">{he.wizard.lockedActive}</p>}
          {activeOrders === 0 && stockTouched && <p className="m-0 mt-1">{he.wizard.lockedStock}</p>}
        </div>
      )}

      {preview ? (
        <div className="flex-1">
          <StepPreview
            cut={merged} media={media} photoCount={photoCount} breeds={breeds} goStep={goStep}
            isDraft={isDraft} save={save} onPublished={() => setPublished(true)}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-5 px-4 pt-2 pb-8 lg:mx-auto lg:w-full lg:max-w-[720px]">
            <FormSection id={1} focus={step}>
              <MediaUploader cutId={cutId} butcherId={butcher.id} media={media} onChange={loadMedia} disabled={cut.status === "withdrawn"} />
            </FormSection>
            <FormSection id={2} focus={step}><StepWhat form={form} set={set} locked={locked} breeds={breeds} /></FormSection>
            <FormSection id={3} focus={step}><StepAging form={form} set={set} locked={locked} /></FormSection>
            <FormSection id={4} focus={step}><StepWeight form={form} set={set} locked={locked} /></FormSection>
            <StepWord form={form} set={set} />
          </div>

          <footer className="sticky bottom-0 z-20 flex flex-col gap-2.5 border-t border-line bg-ink-2 px-4 pt-3.5 pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:px-[max(1rem,calc((100%-720px)/2))]">
            {isDraft ? (
              <div className="grid grid-cols-[1fr_2fr] gap-2.5">
                <button type="button" className="sr-cbtn sr-cbtn--quiet !text-[17px]"
                  onClick={async () => { await save(); safeStorage.set("solor.butcher.cutFilter", "draft"); router.push("/butcher"); }}>
                  {he.wizard.draft}
                </button>
                <button type="button" className="sr-cbtn sr-cbtn--new" onClick={async () => { await save(); goStep(5); }}>
                  {he.wizard.toFeed}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_2fr] gap-2.5">
                <button type="button" className="sr-cbtn sr-cbtn--quiet !text-[17px]" onClick={() => goStep(5)}>{he.wizard.steps[4]}</button>
                <button type="button" className="sr-cbtn" disabled={!dirty || saveState === "saving"} onClick={async () => {
                  if (await save()) { toast(he.wizard.changesSaved, { tone: "success" }); load(); }
                }}>
                  {saveState === "saving" && <Spinner />}{he.wizard.saveChanges}
                </button>
              </div>
            )}
          </footer>
        </>
      )}
    </main>
  );
}

/** One part of the form; opened with ?step=n, the page scrolls to it (the preview's "missing" links land here). */
function FormSection({ id, focus, children }: { id: number; focus: number; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus === id && id > 1) ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focus, id]);
  return <section ref={ref} id={`part-${id}`} className="scroll-mt-20">{children}</section>;
}

/** A labelled group of the form (design: CounterNew `.cf`): a small muted label over its control. */
function Cf({ label, htmlFor, children, error, hint }: { label: string; htmlFor?: string; children: React.ReactNode; error?: string | null; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {htmlFor ? <label htmlFor={htmlFor} className="sr-clabel">{label}</label> : <span className="sr-clabel">{label}</span>}
      {children}
      {error ? <p className="m-0 text-sm font-semibold text-sold" role="alert">{error}</p>
        : hint ? <p className="m-0 text-xs text-stone">{hint}</p> : null}
    </div>
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
  return <span className="text-sm text-stone" role="status">{he.wizard.saving}…</span>;
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
    <div className="flex flex-col gap-4">
      <Cf label={he.wizard.cutType}>
        <div className="flex flex-wrap gap-2">
          {CUT_TYPES.map((c) => (
            <Chip key={c.key} selected={form.cut_type === c.key} disabled={locked("cut_type")} onClick={() => set("cut_type", c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
      </Cf>

      <Cf label={he.wizard.breedShort}>
        {!form.cut_type ? (
          <p className="m-0 text-stone">{he.wizard.pickCutFirst}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              {visibleBreeds.map((b) => (
                <Chip key={b.key} selected={form.breed_key === b.key} disabled={locked("breed_key")}
                  onClick={() => { set("breed_key", b.key); set("breed_other", null); }}>
                  {b.label_he}
                </Chip>
              ))}
              <Chip selected={otherSelected} disabled={locked("breed_key")}
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
      </Cf>

      <Cf label={he.wizard.originShort}>
        <div className="flex flex-wrap gap-2">
          {ORIGINS.map((o) => (
            <Chip key={o.key} selected={form.origin_country === o.key} disabled={locked("origin_country")} onClick={() => set("origin_country", o.key)}>
              {o.label}
            </Chip>
          ))}
        </div>
      </Cf>
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
    <div className="flex flex-col gap-4">
      <Cf label={he.wizard.agingShort}>
        <div className="grid grid-cols-2 gap-1.5">
          <Chip selected={form.is_aged === false} disabled={locked("is_aged")}
            onClick={() => { set("is_aged", false); set("aging_days", null); set("aging_method", null); setDaysText(""); }}>
            {he.wizard.notAged}
          </Chip>
          <Chip selected={form.is_aged === true} disabled={locked("is_aged")} onClick={() => set("is_aged", true)}>{he.wizard.aged}</Chip>
        </div>
      </Cf>

      {form.is_aged && (
        <div className="grid grid-cols-2 gap-2.5">
          <Cf label={he.wizard.agingDaysShort} htmlFor="days" error={daysError}>
            <input id="days" inputMode="numeric" dir="ltr" className={inputClass + " text-end"} disabled={locked("aging_days")}
              value={daysText} onChange={(e) => onDays(e.target.value)} placeholder="28" />
          </Cf>
          <Cf label={he.wizard.agingMethodShort}>
            <div className="grid grid-cols-2 gap-1.5">
              {AGING_METHODS.map((m) => (
                <Chip key={m.key} selected={form.aging_method === m.key} disabled={locked("aging_method")} className="!px-2"
                  onClick={() => set("aging_method", form.aging_method === m.key ? null : m.key)}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </Cf>
        </div>
      )}

    </div>
  );
}

/** The butcher's own read of the cut: marbling on a 1–10 scale and a few words of their own. */
function StepWord({ form, set }: Pick<StepProps, "form" | "set">) {
  return (
    <div className="flex flex-col gap-4">
      <Cf label={he.wizard.marblingShort} hint={form.butcher_marbling == null ? he.wizard.marblingNone : undefined}>
        <div className="sr-mscale" role="group" aria-label={he.wizard.marbling}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" aria-pressed={form.butcher_marbling === n}
              onClick={() => set("butcher_marbling", form.butcher_marbling === n ? null : n)}>{n}</button>
          ))}
        </div>
      </Cf>

      <Cf label={he.wizard.wordFromButcher} htmlFor="desc" hint={`${form.description?.length ?? 0}/500`}>
        <textarea id="desc" rows={3} maxLength={500} placeholder={he.wizard.descriptionPlaceholder}
          className={inputClass} value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)} />
      </Cf>
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
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5">
        <Cf label={he.wizard.weight} htmlFor="weight" error={weightError}>
          <input id="weight" inputMode="numeric" dir="ltr" className={inputClass + " text-end"} disabled={locked("weight_g")}
            value={weightText} onChange={(e) => onWeight(e.target.value)} placeholder="2400" />
        </Cf>
        <Cf label={he.wizard.price} htmlFor="price" error={priceError}>
          <input id="price" inputMode="decimal" dir="ltr" className={inputClass + " text-end"} disabled={locked("price_per_kg_agorot")}
            value={priceText} onChange={(e) => onPrice(e.target.value)} placeholder="220" />
        </Cf>
      </div>

      <Cf label={he.wizard.saleMode}>
        <div className="grid grid-cols-3 gap-1.5">
          {SALE_MODES.map((m) => (
            <Chip key={m.key} selected={form.sale_mode === m.key} disabled={locked("sale_mode")} onClick={() => onSaleMode(m.key)} className="!px-2">
              {m.label}
            </Chip>
          ))}
        </div>
      </Cf>

      {hasSteaks && (
        <>
          <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold">{he.wizard.steakWeight}</h2>
              <span className="text-4xl font-bold"><Ltr>{steakW}</Ltr> <span className="text-base text-stone">{he.wizard.grams}</span></span>
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
            <div className="flex justify-between text-xs text-stone" dir="ltr"><span>150</span><span>1000</span></div>
          </section>

          <section className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold">{he.wizard.thickness}</h2>
              <span className="text-2xl font-extrabold">
                {form.steak_thickness_cm ? <><Ltr>{Number(form.steak_thickness_cm)}</Ltr> <span className="text-sm text-stone">{he.units.cm}</span></> : he.app.none}
              </span>
            </div>
            <input
              type="range" className="big-range mt-2" dir="ltr" min={1} max={8} step={0.5}
              value={form.steak_thickness_cm ?? 3} aria-label={he.wizard.thickness} disabled={locked("steak_thickness_cm")}
              onChange={(e) => set("steak_thickness_cm", Number(e.target.value))}
            />
            {form.steak_thickness_cm != null && (
              <button type="button" className="min-h-11 text-sm font-semibold text-stone underline" disabled={locked("steak_thickness_cm")}
                onClick={() => set("steak_thickness_cm", null)}>{he.app.none}</button>
            )}
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
            <div>
              <h2 className="font-bold">{he.wizard.steaksCount}</h2>
              <p className="text-sm text-stone">{mx > 0 ? he.wizard.steaksMax(mx) : form.weight_g ? he.wizard.noSteaksFit : ""}</p>
            </div>
            {mx > 0 && (
              <Stepper size="lg" value={planned} min={1} max={mx} label={he.wizard.steaksCount}
                onChange={(v) => !locked("steaks_planned") && set("steaks_planned", v >= mx ? null : v)} />
            )}
          </section>
        </>
      )}

      {summary && (
        <div className="rounded-2xl bg-ivory px-4 py-3 text-center font-bold text-ink" aria-live="polite">{summary}</div>
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
    <div className="flex flex-col">
      <div className="bg-gold-soft px-4 py-2 text-center font-bold">{he.cut.previewBar}</div>
      <div data-theme="customer" className="pointer-events-auto bg-ink text-ivory">
        <CutDetail cut={live} media={media} breeds={breeds} butcher={butcher}>
          <PurchaseBar cut={live} preview inline />
        </CutDetail>
      </div>

      <div className="flex flex-col gap-3 bg-ink px-4 py-5 lg:mx-auto lg:w-full lg:max-w-[720px]">
        {missing.length > 0 && (
          <div className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]" role="alert">
            <p className="m-0 mb-2 font-bold text-sold">{he.wizard.missingTitle}</p>
            <ul className="flex flex-col gap-1">
              {missing.map((f) => (
                <li key={f}>
                  <button type="button" onClick={() => goStep(FIELD_STEP[f] ?? 1)} className="min-h-11 font-semibold text-sold underline underline-offset-4">
                    {he.missingFields[f] ?? f}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isDraft && (
          <>
            <button type="button" className="sr-cbtn sr-cbtn--new" disabled={missing.length > 0 || photosOf(media).length === 0} onClick={() => setConfirm(true)}>
              {he.wizard.toFeed}
            </button>
            <button type="button" className="sr-cbtn sr-cbtn--quiet !text-[17px]"
              onClick={async () => { await save(); safeStorage.set("solor.butcher.cutFilter", "draft"); router.push("/butcher"); }}>
              {he.wizard.saveDraft}
            </button>
            <button type="button" className="mt-2 min-h-11 font-semibold text-sold" onClick={() => setConfirmDelete(true)}>
              {he.cutManage.deleteDraft}
            </button>
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
      <span aria-hidden className="grid size-[88px] place-items-center rounded-full text-success shadow-[inset_0_0_0_2px_var(--state-success)]">
        <IconCheck className="!size-11" />
      </span>
      <h1 className="font-display text-4xl font-bold">{he.wizard.published}</h1>
      <span className="code !text-lg">{code}</span>
      <div className="flex w-full flex-col gap-3">
        <button type="button" className="sr-cbtn sr-cbtn--new" onClick={() => router.push("/butcher/cuts/new")}>{he.wizard.anotherCut}</button>
        <button type="button" className="sr-cbtn sr-cbtn--quiet" onClick={() => router.push("/butcher")}>{he.wizard.toMyCuts}</button>
      </div>
    </main>
  );
}
