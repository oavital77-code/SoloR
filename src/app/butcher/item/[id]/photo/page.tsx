"use client";
// T7 — a tray's photo and confirm (BUTCHER_FLOW_v2). The tray goes under the camera, "📷 צלם"; the preview is the
// customer's card exactly (ItemPreviewCard), the price on it can be changed for this tray (R11); "✅ אשר" is the
// publishing — the tray takes its number now ("15-01", R3) and it is shown big, to write on the sticker. Blocked, with
// what is missing, until everything is there. "↺ צלם שוב" and "+ עוד תמונה" (up to four).
import { use, useState } from "react";
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
import { MAX_PHOTOS, useShoot } from "@/components/butcher/flow/useShoot";
import type { Item } from "@/lib/types";

export default function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { item, parent, state, reload } = useItem(id);
  const { butcher } = useButcher();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [pricing, setPricing] = useState<string | null>(null);

  const photos = item ? photosOf(item.cut_media) : [];
  const { take, uploading, fileInput } = useShoot({ item_id: id }, photos, reload);

  if (state !== "ok" || !item || !parent) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const missing = itemMissing(item, parent, photos.length);
  const parentGaps = missing.filter((m) => !["photos", "weight_g", "steak_count", "price_per_kg"].includes(m));
  const unit = item.kind === "unit";
  const title = he.flow.photoTitle(item.label);

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
    router.replace(unit ? `/butcher/parent/${it.parent_id}/units?live=${encodeURIComponent(it.label ?? "")}` : `/butcher/parent/${it.parent_id}/summary`);
  }

  return (
    <FlowScreen parent={parent} title={<span className="ltr font-[family-name:var(--font-plex-mono)] text-[28px]">{title}</span>} back={`/butcher/item/${id}/weigh`}
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
      {fileInput}

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
