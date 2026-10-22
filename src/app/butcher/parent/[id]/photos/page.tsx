"use client";
// T2 — photos of the whole cut (BUTCHER_FLOW_v2 §3), right after the video: they are the parent's, and the block
// shows them. "📷 צלם", then "↺ צלם שוב" / "+ עוד תמונה" (up to four) and "המשך" to the clip's number.
import { use } from "react";
import { useRouter } from "next/navigation";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { useParent } from "@/components/butcher/flow/useParent";
import { MAX_PHOTOS, useShoot } from "@/components/butcher/flow/useShoot";
import { Spinner } from "@/components/ui";
import { IconCamera } from "@/components/icons";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf } from "@/lib/cut-helpers";

export default function ParentPhotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, media, state, reload } = useParent(id);
  const router = useRouter();
  const photos = photosOf(media);
  const { take, uploading, fileInput } = useShoot({ parent_id: id }, photos, reload);

  if (state !== "ok" || !parent) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  const next = parent.code == null ? `/butcher/parent/${id}/code` : `/butcher/parent/${id}/details`;
  return (
    <FlowScreen title={he.flow.parentPhotosTitle} sub={he.flow.parentPhotosHint} back={parent.code == null ? null : `/butcher/parent/${id}/details`}
      footer={photos.length === 0
        ? <button type="button" className="sr-cbtn sr-cbtn--new" disabled={uploading > 0} onClick={() => take(false)}>{uploading ? <Spinner /> : he.flow.shoot}</button>
        : <button type="button" className="sr-cbtn sr-cbtn--new" disabled={uploading > 0} onClick={() => router.push(next)}>{he.flow.next}</button>}>
      {fileInput}
      {photos.length === 0 ? (
        <div className="sr-shotframe">
          <div className="sr-shotframe__guide" aria-hidden />
          <span className="sr-shotframe__tip">{he.flow.parentPhotoTip}</span>
          <div className="absolute inset-0 grid place-items-center">
            <button type="button" onClick={() => take(false)} disabled={uploading > 0} aria-label={he.flow.shoot}
              className="grid size-24 place-items-center rounded-full bg-white/90 text-black shadow-lg">
              {uploading ? <Spinner /> : <IconCamera className="size-10" />}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-ink-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(photos[0].storage_path)} alt="" className="h-full w-full object-cover" />
          </div>
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
    </FlowScreen>
  );
}
