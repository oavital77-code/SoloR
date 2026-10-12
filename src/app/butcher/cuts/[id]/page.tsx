"use client";
// B4 — manage an existing cut: stock, orders on it, edit / store sale / withdraw / delete draft / revert.
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil, Store, Trash2, Undo2, EyeOff } from "lucide-react";
import { clsx } from "clsx";
import { useButcher } from "@/components/butcher/ButcherShell";
import { StatusPill } from "@/components/butcher/CutList";
import { BUTCHER_ORDER_SELECT, orderWhat, type ButcherOrderRow } from "@/components/butcher/OrderList";
import { CutDetail } from "@/components/CutDetail";
import { OrderStatusBadge } from "@/components/OrderStatusBadge";
import { useToast } from "@/components/Toast";
import { BottomSheet, Button, ConfirmDialog, ErrorState, Ltr, Spinner, Stepper } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { cutTitle } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { useBreeds, useNow, useRefetchOnFocus } from "@/lib/hooks";
import { formatAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { removeStorageObjects } from "@/lib/upload";
import { timeAgo } from "@/lib/cut-helpers";
import type { Cut, CutMedia } from "@/lib/types";

type Confirm = null | "withdraw" | "delete" | "revert";

export default function ManageCutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { butcher, ordersVersion } = useButcher();
  const breeds = useBreeds();
  const router = useRouter();
  const toast = useToast();
  const now = useNow();
  const [cut, setCut] = useState<Cut | null>(null);
  const [media, setMedia] = useState<CutMedia[]>([]);
  const [orders, setOrders] = useState<ButcherOrderRow[]>([]);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [saleOpen, setSaleOpen] = useState(false);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [{ data: c, error }, { data: os }] = await Promise.all([
      sb.from("cuts").select("*, cut_media(*)").eq("id", id).maybeSingle(),
      sb.from("orders").select(BUTCHER_ORDER_SELECT).eq("cut_id", id).order("created_at", { ascending: false }),
    ]);
    if (error || !c) return setError(true);
    const { cut_media, ...rest } = c as Cut & { cut_media: CutMedia[] };
    if (rest.status === "draft") return router.replace(`/butcher/cuts/${id}/edit`);
    setCut(rest);
    setMedia(cut_media);
    setOrders((os ?? []) as ButcherOrderRow[]);
  }, [id, router]);

  useEffect(() => { load(); }, [load, ordersVersion]);
  useRefetchOnFocus(load);

  // live stock updates for this cut
  useEffect(() => {
    const sb = supabaseBrowser();
    const ch = sb.channel(`butcher-cut-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cuts", filter: `id=eq.${id}` },
        (p) => setCut((c) => (c ? { ...c, ...(p.new as Cut) } : c)))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [id]);

  async function run(action: Exclude<Confirm, null>) {
    if (!cut) return;
    setBusy(true);
    const sb = supabaseBrowser();
    if (action === "delete") {
      const { error } = await sb.from("cuts").delete().eq("id", cut.id);
      setBusy(false);
      if (error) return toast(errorText(error), { tone: "error" });
      removeStorageObjects(media.flatMap((m) => [m.storage_path, m.thumb_path, m.poster_path])).catch(() => {});
      return router.replace("/butcher");
    }
    const fn = action === "withdraw" ? "withdraw_cut" : "revert_to_draft";
    const { error } = await sb.rpc(fn, { p_cut_id: cut.id });
    setBusy(false);
    setConfirm(null);
    if (error) return toast(errorText(error), { tone: "error" });
    if (action === "revert") return router.replace(`/butcher/cuts/${cut.id}/edit`);
    load();
  }

  if (error) return <ErrorState onRetry={() => { setError(false); load(); }} />;
  if (!cut) return <div className="grid min-h-dvh place-items-center"><Spinner /></div>;

  const title = cutTitle(cut, breeds);
  const hasSteaks = cut.sale_mode === "steaks" || cut.sale_mode === "both";
  const activeOrders = orders.filter((o) => ["new", "preparing", "ready"].includes(o.status)).length;
  const anyOrders = orders.length > 0;

  return (
    <main className="pb-10">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 backdrop-blur">
        <Link href="/butcher" className="grid size-11 place-items-center" aria-label={he.app.back}><ChevronRight className="size-6" /></Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold">{title}</p>
          <Ltr className="text-sm text-neutral-500">{cut.code}</Ltr>
        </div>
        <StatusPill status={cut.status} />
      </header>

      <section className="m-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-neutral-200">
        <h2 className="mb-2 font-extrabold">{he.cutManage.stock}</h2>
        <div className="flex flex-wrap gap-3 text-lg">
          {hasSteaks && (
            <span className="rounded-xl bg-neutral-100 px-3 py-2 font-bold">
              <Ltr>{he.butcher.stockSteaks(cut.steaks_available, cut.steaks_total)}</Ltr>
            </span>
          )}
          {cut.sale_mode !== "steaks" && (
            <span className={clsx("rounded-xl px-3 py-2 font-bold", cut.whole_available ? "bg-emerald-100 text-emerald-900" : "bg-neutral-100 text-neutral-500")}>
              {cut.whole_available ? he.butcher.stockWhole : `${he.cut.whole} — ${he.feed.soldOut}`}
            </span>
          )}
        </div>
      </section>

      {cut.status !== "withdrawn" && (
        <section className="mx-4 grid grid-cols-2 gap-2">
          <Link href={`/butcher/cuts/${cut.id}/edit?step=1`} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold ring-1 ring-neutral-300">
            <Pencil className="size-5" /> {he.cutManage.edit}
          </Link>
          <Button size="lg" variant="secondary" className="bg-white" disabled={cut.status !== "published"} onClick={() => setSaleOpen(true)}>
            <Store className="size-5" /> {he.cutManage.storeSale}
          </Button>
          <Button size="lg" variant="danger" className="col-span-2" disabled={activeOrders > 0} onClick={() => setConfirm("withdraw")}>
            <EyeOff className="size-5" /> {he.cutManage.withdraw}
          </Button>
          {activeOrders > 0 && <p className="col-span-2 text-sm text-neutral-500">{he.errors.HAS_ACTIVE_ORDERS}</p>}
          {cut.status === "published" && !anyOrders && cut.steaks_available === cut.steaks_total && (
            <Button variant="ghost" className="col-span-2 text-neutral-600" onClick={() => setConfirm("revert")}>
              <Undo2 className="size-4" /> {he.cutManage.revertDraft}
            </Button>
          )}
        </section>
      )}

      <section className="m-4">
        <h2 className="mb-2 font-extrabold">{he.cutManage.orders}</h2>
        {orders.length === 0 ? <p className="text-neutral-500">{he.cutManage.noOrders}</p> : (
          <ul className="flex flex-col gap-2">
            {orders.map((o) => (
              <li key={o.id}>
                <Link href={`/butcher/orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
                  <span className="flex flex-col">
                    <span className="font-bold"><Ltr>#{o.order_number}</Ltr> · {orderWhat(o)}</span>
                    <span className="text-sm text-neutral-500">{o.profiles?.full_name} · {timeAgo(o.created_at, now)} · <Ltr>₪{formatAgorot(o.total_agorot)}</Ltr></span>
                  </span>
                  <OrderStatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 overflow-hidden">
        <CutDetail cut={cut} media={media} breeds={breeds} butcher={butcher} />
      </section>

      {cut.status === "draft" && (
        <div className="m-4"><Button variant="danger" onClick={() => setConfirm("delete")}><Trash2 className="size-4" />{he.cutManage.deleteDraft}</Button></div>
      )}

      <StoreSaleSheet open={saleOpen} cut={cut} onClose={() => setSaleOpen(false)} onDone={(c) => { setCut(c); setSaleOpen(false); toast(he.cutManage.storeSaleDone, { tone: "success" }); }} />

      <ConfirmDialog
        open={confirm != null} danger={confirm !== "revert"} loading={busy}
        text={confirm === "withdraw" ? he.cutManage.withdrawConfirm : confirm === "delete" ? he.cutManage.deleteConfirm : he.cutManage.revertConfirm}
        confirmLabel={confirm === "withdraw" ? he.cutManage.withdraw : confirm === "delete" ? he.cutManage.deleteDraft : he.cutManage.revertDraft}
        onConfirm={() => confirm && run(confirm)} onCancel={() => setConfirm(null)}
      />
    </main>
  );
}

function StoreSaleSheet({ open, cut, onClose, onDone }: { open: boolean; cut: Cut; onClose: () => void; onDone: (c: Cut) => void }) {
  const toast = useToast();
  const hasSteaks = (cut.sale_mode === "steaks" || cut.sale_mode === "both") && cut.steaks_available > 0;
  const [mode, setMode] = useState<"all" | "steaks">(hasSteaks ? "steaks" : "all");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setMode(hasSteaks ? "steaks" : "all"); setQty(1); } }, [open, hasSteaks]);

  async function submit() {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("store_sale", {
      p_cut_id: cut.id, p_steaks_qty: mode === "steaks" ? qty : null, p_sell_all: mode === "all",
    });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    onDone(data as Cut);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={he.cutManage.storeSale}>
      <div className="flex flex-col gap-3">
        <button type="button" onClick={() => setMode("all")} aria-pressed={mode === "all"}
          className={clsx("min-h-16 rounded-2xl px-4 text-start text-lg font-bold ring-1", mode === "all" ? "bg-brand text-white ring-brand" : "ring-neutral-300")}>
          {he.cutManage.soldAll}
        </button>
        {hasSteaks && (
          <div className={clsx("flex items-center justify-between rounded-2xl px-4 py-3 ring-1", mode === "steaks" ? "ring-2 ring-brand" : "ring-neutral-300")}
            onClick={() => setMode("steaks")}>
            <span className="text-lg font-bold">{he.cutManage.soldSteaks}</span>
            <Stepper size="lg" value={qty} min={1} max={cut.steaks_available} onChange={(v) => { setMode("steaks"); setQty(v); }} label={he.cutManage.soldSteaks} />
          </div>
        )}
        <Button size="xl" loading={busy} onClick={submit} className="mt-2">{he.cutManage.storeSaleConfirm}</Button>
      </div>
    </BottomSheet>
  );
}
