"use client";
// S6 — photo and confirm (also the remainder's, S7). The tray with its label goes under the camera, "📷 צלם";
// the preview is the customer's card exactly (ItemPreviewCard), the price on it can be changed for this item
// (R11); "✅ אשר והעלה" is the publishing (R8) — blocked, with what is missing, until R9 holds. "↺ צלם שוב" and
// "+ עוד תמונה" (up to four).
import { use, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useButcher } from "@/components/butcher/ButcherShell";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { ItemPreviewCard } from "@/components/butcher/flow/ItemPreviewCard";
import { Keypad } from "@/components/butcher/flow/Keypad";
import { useItem } from "@/components/butcher/flow/useParent";
import { BottomSheet, Ltr, Spinner } from "@/components/ui";
import { IconCamera } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { itemMissing, mediaUrl, photosOf } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { agorotToShekelsInput, shekelsToAgorot } from "@/lib/pricing";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaPath, prepareImage, removeStorageObjects, tusUpload } from "@/lib/upload";
import type { Item } from "@/lib/types";

const MAX_PHOTOS = 4;
const FRESH_MS = 15 * 60 * 1000;

export default function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { item, parent, state, reload } = useItem(id);
  const { butcher } = useButcher();
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const replace = useRef(false);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState<string | null>(null);

  if (state !== "ok" || !item || !parent) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const photos = photosOf(item.cut_media);
  const missing = itemMissing(item, parent, photos.length);
  const parentGaps = missing.filter((m) => !["photos", "weight_g", "steak_count", "price_per_kg"].includes(m));
  const unit = item.kind === "unit";
  const title = unit ? he.flow.photoTitle(item.label) : parent.split ? he.flow.remainderTitle(item.label) : he.flow.wholeTitle(item.label);

  async function shoot(files: FileList | null) {
    const file = files?.[0];
    if (!file || !item) return;
    if (Date.now() - file.lastModified > FRESH_MS) return toast(he.wizard.notFresh, { tone: "error" });
    setUploading((n) => n + 1);
    try {
      const sb = supabaseBrowser();
      if (replace.current && photos[0]) {
        const old = photos[0];
        await sb.from("cut_media").delete().eq("id", old.id);
        removeStorageObjects([old.storage_path, old.thumb_path]).catch(() => {});
      }
      const img = await prepareImage(file);
      const full = mediaPath(butcher.id, item.id, "jpg");
      const thumb = full.replace(/\.jpg$/, "_t.jpg");
      await tusUpload(img.full, full, "image/jpeg", () => {}).promise;
      await tusUpload(img.thumb, thumb, "image/jpeg", () => {}).promise;
      const { error } = await sb.from("cut_media").insert({
        item_id: item.id, type: "photo", storage_path: full, thumb_path: thumb, is_cover: replace.current || photos.length === 0,
        sort_order: replace.current ? 0 : photos.length, width: img.width || null, height: img.height || null,
      });
      if (error) throw error;
      await reload();
    } catch {
      toast(he.wizard.uploadFailed, { tone: "error" });
    } finally {
      replace.current = false;
      setUploading((n) => n - 1);
    }
  }

  async function savePrice() {
    if (pricing == null || !item) return;
    const agorot = pricing ? shekelsToAgorot(pricing) : null;
    const { error } = await supabaseBrowser().from("items").update({ price_per_kg_agorot: agorot }).eq("id", item.id);
    if (error) return toast(errorText(error), { tone: "error" });
    setPricing(null);
    reload();
  }

  async function publish() {
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("publish_item", { p_item_id: id });
    setBusy(false);
    if (error) return toast(errorText(error), { tone: "error" });
    const it = data as Item;
    router.replace(unit ? `/butcher/parent/${it.parent_id}/units?live=${encodeURIComponent(it.label)}` : `/butcher/parent/${it.parent_id}/summary`);
  }

  const take = (again: boolean) => { replace.current = again; input.current?.click(); };
  return (
    <FlowScreen title={<span className="ltr font-[family-name:var(--font-plex-mono)] text-[28px]">{title}</span>} back={`/butcher/item/${id}/weigh`}
      footer={
        <>
          {missing.length > 0 && photos.length > 0 && (
            <p className="m-0 text-sm font-semibold text-sold" role="alert">
              {he.flow.missingBefore} {missing.map((m) => he.missingFields[m] ?? m).join(", ")}
            </p>
          )}
          {parentGaps.length > 0 && <Link href={`/butcher/parent/${parent.id}/details`} className="sr-cbtn sr-cbtn--quiet">{he.flow.fillDetails}</Link>}
          {photos.length === 0
            ? <button type="button" className="sr-cbtn sr-cbtn--new" disabled={uploading > 0} onClick={() => take(false)}>{uploading ? <Spinner /> : he.flow.shoot}</button>
            : <button type="button" className="sr-cbtn sr-cbtn--ready" disabled={busy || uploading > 0 || missing.length > 0} onClick={publish}>
                {busy ? he.flow.publishing : he.flow.confirmUpload}
              </button>}
        </>
      }>
      <input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { shoot(e.target.files); e.target.value = ""; }} />

      {photos.length === 0 ? (
        <div className="sr-shotframe">
          <div className="sr-shotframe__guide" aria-hidden />
          <span className="sr-shotframe__tip">{he.flow.photoTip}</span>
          <div className="absolute inset-0 grid place-items-center">
            <button type="button" onClick={() => take(false)} disabled={uploading > 0} aria-label={he.flow.shoot}
              className="grid size-24 place-items-center rounded-full bg-white/90 text-black shadow-lg">
              {uploading ? <Spinner /> : <IconCamera className="size-10" />}
            </button>
          </div>
        </div>
      ) : (
        <>
          <ItemPreviewCard item={item} parent={parent} shop={butcher}
            onPriceTap={() => setPricing(agorotToShekelsInput(item.price_per_kg_agorot ?? parent.price_per_kg_agorot))} />
          <p className="m-0 text-center text-xs text-stone">{he.flow.priceTap}</p>
          <div className="flex gap-2">
            <button type="button" className="sr-cchip flex-1" disabled={uploading > 0} onClick={() => take(true)}>{he.flow.retake}</button>
            <button type="button" className="sr-cchip flex-1" disabled={uploading > 0 || photos.length >= MAX_PHOTOS} onClick={() => take(false)}>{he.flow.morePhoto}</button>
          </div>
          {photos.length > 1 && (
            <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
              {photos.map((m) => (
                <li key={m.id} className="aspect-square overflow-hidden rounded-xl bg-ink-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(m.thumb_path ?? m.storage_path)} alt="" className="h-full w-full object-cover" />
                </li>
              ))}
            </ul>
          )}
          {uploading > 0 && <div className="flex justify-center"><Spinner /></div>}
        </>
      )}

      {pricing != null && (
        <BottomSheet open onClose={() => setPricing(null)} title={he.flow.unitPrice}>
          <div className="flex flex-col gap-3 pb-2">
            <span className="text-center text-[40px] font-black"><Ltr>{pricing ? `₪${pricing}` : "—"}</Ltr></span>
            <Keypad value={pricing} decimal max={6} maxValue={5000} onChange={setPricing} />
            <button type="button" className="sr-cbtn sr-cbtn--new" onClick={savePrice}>{he.app.save}</button>
          </div>
        </BottomSheet>
      )}
    </FlowScreen>
  );
}
