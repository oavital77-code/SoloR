"use client";
// Wizard step 1, in the order the work happens: film the butchering, then photograph the finished cut.
// Camera only (founders' decision 15.10.2026): no gallery pickers, and a file must have been captured just now.
// Per-file progress, cover selection, ordering, delete, retry.
import { useRef, useState } from "react";
import { clsx } from "clsx";
import { Button, Ltr } from "../ui";
import { IconBack, IconCamera, IconClose } from "../icons";
import { useToast } from "../Toast";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf, sortedMedia, videoOf } from "@/lib/cut-helpers";
import { errorText } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/client";
import { extOf, inspectVideo, mediaPath, prepareImage, removeStorageObjects, tusUpload } from "@/lib/upload";
import { MEDIA_LIMITS } from "@/lib/validation";
import type { CutMedia } from "@/lib/types";

interface Pending {
  key: string;
  kind: "photo" | "video";
  file: File;
  preview: string;
  progress: number;
  status: "processing" | "uploading" | "error";
  error?: string;
  abort?: () => void;
}

const FRESH_MS = 15 * 60 * 1000;

export function MediaUploader({ cutId, butcherId, media, onChange, disabled }: {
  cutId: string; butcherId: string; media: CutMedia[]; onChange: () => Promise<void> | void; disabled?: boolean;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const camPhoto = useRef<HTMLInputElement>(null);
  const camVideo = useRef<HTMLInputElement>(null);

  const photos = photosOf(media);
  const ordered = sortedMedia(media).filter((m) => m.type === "photo");
  const video = videoOf(media);
  const pendingPhotos = pending.filter((p) => p.kind === "photo").length;
  const pendingVideo = pending.some((p) => p.kind === "video");

  const patch = (key: string, p: Partial<Pending>) =>
    setPending((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const drop = (key: string) =>
    setPending((xs) => {
      const it = xs.find((x) => x.key === key);
      if (it) URL.revokeObjectURL(it.preview);
      return xs.filter((x) => x.key !== key);
    });

  async function uploadPhoto(item: Pending) {
    try {
      patch(item.key, { status: "processing", progress: 0, error: undefined });
      const img = await prepareImage(item.file);
      const fullPath = mediaPath(butcherId, cutId, "jpg");
      const thumbPath = fullPath.replace(/\.jpg$/, "_t.jpg");
      patch(item.key, { status: "uploading" });
      const up = tusUpload(img.full, fullPath, "image/jpeg", (pct) => patch(item.key, { progress: Math.round(pct * 0.9) }));
      patch(item.key, { abort: up.abort });
      await up.promise;
      await tusUpload(img.thumb, thumbPath, "image/jpeg", () => {}).promise;
      patch(item.key, { progress: 100 });
      const sb = supabaseBrowser();
      const { count } = await sb.from("cut_media").select("id", { count: "exact", head: true }).eq("cut_id", cutId);
      // no explicit cover on insert: the first photo is the cover until the butcher picks another (photosOf)
      const { error } = await sb.from("cut_media").insert({
        cut_id: cutId, type: "photo", storage_path: fullPath, thumb_path: thumbPath,
        sort_order: count ?? 0, width: img.width || null, height: img.height || null,
      });
      if (error) throw error;
      await onChange();
      drop(item.key);
    } catch (e) {
      if ((e as Error)?.message === "ABORTED") return drop(item.key);
      patch(item.key, { status: "error", error: he.wizard.uploadFailed });
    }
  }

  async function uploadVideo(item: Pending) {
    try {
      patch(item.key, { status: "processing", progress: 0, error: undefined });
      if (item.file.size > MEDIA_LIMITS.maxVideoBytes) throw new Error(he.wizard.videoTooBig);
      const info = await inspectVideo(item.file).catch(() => null);
      if (info && info.duration > MEDIA_LIMITS.maxVideoSeconds + 0.5) throw new Error(he.wizard.videoTooLong);
      const ext = extOf(item.file, "mp4");
      const path = mediaPath(butcherId, cutId, ext);
      let posterPath: string | null = null;
      if (info?.poster) {
        posterPath = path.replace(/\.[a-z0-9]+$/, "_poster.jpg");
        await tusUpload(info.poster, posterPath, "image/jpeg", () => {}).promise.catch(() => { posterPath = null; });
      }
      patch(item.key, { status: "uploading" });
      const up = tusUpload(item.file, path, item.file.type || "video/mp4", (pct) => patch(item.key, { progress: pct }));
      patch(item.key, { abort: up.abort });
      await up.promise;
      const { error } = await supabaseBrowser().from("cut_media").insert({
        cut_id: cutId, type: "video", storage_path: path, poster_path: posterPath,
        width: info?.width || null, height: info?.height || null,
        duration_s: info?.duration ? Math.round(info.duration * 10) / 10 : null,
      });
      if (error) throw error;
      await onChange();
      drop(item.key);
    } catch (e) {
      const msg = (e as Error)?.message;
      if (msg === "ABORTED") return drop(item.key);
      const known = msg === he.wizard.videoTooBig || msg === he.wizard.videoTooLong;
      patch(item.key, { status: "error", error: known ? msg : he.wizard.uploadFailed });
    }
  }

  function addFiles(input: FileList | null, kind: "photo" | "video") {
    if (!input?.length) return;
    // a capture made now has a fresh timestamp; an old file from the device library does not
    const files = Array.from(input).filter((f) => Date.now() - f.lastModified < FRESH_MS);
    if (files.length < input.length) toast(he.wizard.notFresh, { tone: "error" });
    if (!files.length) return;
    if (kind === "photo") {
      const room = MEDIA_LIMITS.maxPhotos - photos.length - pendingPhotos;
      const list = files.slice(0, Math.max(0, room));
      if (files.length > list.length) toast(he.wizard.maxPhotos, { tone: "error" });
      list.forEach((file) => {
        const item: Pending = { key: crypto.randomUUID(), kind, file, preview: URL.createObjectURL(file), progress: 0, status: "processing" };
        setPending((xs) => [...xs, item]);
        uploadPhoto(item);
      });
    } else {
      if (video || pendingVideo) return toast(he.wizard.oneVideo, { tone: "error" });
      const file = files[0];
      const item: Pending = { key: crypto.randomUUID(), kind, file, preview: URL.createObjectURL(file), progress: 0, status: "processing" };
      setPending((xs) => [...xs, item]);
      uploadVideo(item);
    }
  }

  const coverId = photos[0]?.id;

  async function setCover(m: CutMedia) {
    if (m.id === coverId || disabled) return;
    const sb = supabaseBrowser();
    await sb.from("cut_media").update({ is_cover: false }).eq("cut_id", cutId).eq("is_cover", true);
    const { error } = await sb.from("cut_media").update({ is_cover: true }).eq("id", m.id);
    if (error) toast(errorText(error), { tone: "error" });
    await onChange();
  }

  async function move(m: CutMedia, dir: -1 | 1) {
    const idx = ordered.findIndex((x) => x.id === m.id);
    const other = ordered[idx + dir];
    if (!other) return;
    const sb = supabaseBrowser();
    // normalise sort orders to the current visual order, then swap
    const next = ordered.map((x, i) => ({ id: x.id, sort_order: i }));
    next[idx].sort_order = idx + dir;
    next[idx + dir].sort_order = idx;
    await Promise.all(next.map((x) => sb.from("cut_media").update({ sort_order: x.sort_order }).eq("id", x.id)));
    await onChange();
  }

  async function remove(m: CutMedia) {
    const sb = supabaseBrowser();
    const { error } = await sb.from("cut_media").delete().eq("id", m.id);
    if (error) return toast(errorText(error), { tone: "error" });
    removeStorageObjects([m.storage_path, m.thumb_path, m.poster_path]).catch(() => {});
    await onChange();
  }

  const retry = (p: Pending) => (p.kind === "photo" ? uploadPhoto(p) : uploadVideo(p));

  const cover = ordered.find((m) => m.id === coverId) ?? ordered[0];
  const morePhotos = disabled || photos.length + pendingPhotos >= MEDIA_LIMITS.maxPhotos;

  // design: CounterNew — the finished cut in a 4:3 frame with the framing guide and the one tip, the two
  // camera buttons on it; under it the other photos (tap to make one the cover) and the butchering video
  return (
    <div className="flex flex-col gap-3">
      <input ref={camPhoto} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
      <input ref={camVideo} hidden type="file" accept="video/*" capture="environment" onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />

      <div className="sr-shotframe">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaUrl(cover.storage_path)} alt={he.wizard.photosTitle} />
        )}
        <div className="sr-shotframe__guide" aria-hidden />
        <span className="sr-shotframe__tip">{he.wizard.shotTip}</span>
        {!cover && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-sm leading-5 text-white/75">{he.wizard.photosHint}</p>}
        <div className="sr-shotframe__actions">
          <button type="button" className="sr-cchip flex-1" disabled={morePhotos} onClick={() => camPhoto.current?.click()}>
            <IconCamera />{cover ? he.wizard.addPhoto : he.wizard.takePhoto}
          </button>
          <button type="button" className="sr-cchip flex-1" disabled={disabled || !!video || pendingVideo} onClick={() => camVideo.current?.click()}>
            {he.wizard.addVideo}
          </button>
        </div>
      </div>
      <p className="m-0 text-xs text-stone">{he.wizard.cameraOnly}</p>

      {(ordered.length > 1 || pendingPhotos > 0) && (
        <>
          <p className="m-0 text-sm text-stone">{he.wizard.coverHint}</p>
          <ul className="m-0 grid list-none grid-cols-4 gap-2 p-0">
            {ordered.map((m, i) => (
              <li key={m.id} className={clsx("relative aspect-square overflow-hidden rounded-xl bg-ink-3", m.id === cover?.id && "ring-2 ring-ivory")}>
                <button type="button" className="h-full w-full" onClick={() => setCover(m)} aria-label={he.wizard.cover}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(m.thumb_path ?? m.storage_path)} alt="" className="h-full w-full object-cover" />
                </button>
                <button type="button" onClick={() => remove(m)} disabled={disabled} aria-label={he.wizard.remove}
                  className="absolute top-1 end-1 grid size-8 place-items-center rounded-full bg-black/60 text-white">
                  <IconClose className="!size-4" />
                </button>
                <div className="absolute inset-x-1 bottom-1 flex justify-between">
                  <button type="button" onClick={() => move(m, -1)} disabled={i === 0 || disabled} aria-label={he.wizard.moveEarlier}
                    className="grid size-8 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0">
                    <IconBack className="!size-4" />
                  </button>
                  <button type="button" onClick={() => move(m, 1)} disabled={i === ordered.length - 1 || disabled} aria-label={he.wizard.moveLater}
                    className="grid size-8 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0">
                    <IconBack className="!size-4 rotate-180" />
                  </button>
                </div>
              </li>
            ))}
            {pending.filter((p) => p.kind === "photo").map((p) => <PendingTile key={p.key} p={p} onRetry={() => retry(p)} onCancel={() => { p.abort?.(); drop(p.key); }} />)}
          </ul>
        </>
      )}

      {video && (
        <div className="flex flex-col gap-1.5">
          <span className="sr-clabel">{he.wizard.videoTitle}</span>
          <div className="relative overflow-hidden rounded-2xl bg-black">
            <video src={mediaUrl(video.storage_path)} poster={mediaUrl(video.poster_path)} controls playsInline preload="metadata" className="max-h-72 w-full" />
            <button type="button" onClick={() => remove(video)} disabled={disabled}
              className="absolute top-2 end-2 min-h-10 rounded-full bg-black/60 px-3 text-sm font-bold text-white">
              {he.wizard.remove}
            </button>
          </div>
        </div>
      )}
      {!video && !pendingVideo && <p className="m-0 text-xs text-stone">{he.wizard.videoHint}</p>}
      {pending.filter((p) => p.kind === "video").map((p) => (
        <div key={p.key} className="rounded-2xl bg-ink-2 p-4 shadow-[var(--shadow-card)]">
          <ProgressLine p={p} onRetry={() => retry(p)} onCancel={() => { p.abort?.(); drop(p.key); }} />
        </div>
      ))}
    </div>
  );
}

function PendingTile({ p, onRetry, onCancel }: { p: Pending; onRetry: () => void; onCancel: () => void }) {
  return (
    <li className="relative aspect-square overflow-hidden rounded-2xl bg-ink-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
        {p.status === "error" ? (
          <>
            <span className="text-xs font-bold text-sold">{p.error}</span>
            <button type="button" onClick={onRetry} className="flex min-h-9 items-center gap-1 rounded-full bg-ink-2 px-3 text-sm font-bold shadow">
              {he.app.retry}
            </button>
          </>
        ) : (
          <span className="text-sm font-bold"><Ltr>{p.status === "processing" ? he.wizard.processing : `${p.progress}%`}</Ltr></span>
        )}
      </div>
      {p.status !== "error" && (
        <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-ink-2/70">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${p.progress}%` }} />
        </div>
      )}
      <button type="button" onClick={onCancel} className="absolute top-1 end-1 min-h-9 rounded-full bg-black/60 px-2.5 text-xs font-bold text-white">
        {he.app.cancel}
      </button>
    </li>
  );
}

function ProgressLine({ p, onRetry, onCancel }: { p: Pending; onRetry: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-sm font-semibold">
          <span className={clsx(p.status === "error" && "text-sold")}>
            {p.status === "error" ? p.error : p.status === "processing" ? he.wizard.processing : he.wizard.uploading}
          </span>
          {p.status === "uploading" && <Ltr>{p.progress}%</Ltr>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-3">
          <div className={clsx("h-full transition-[width]", p.status === "error" ? "bg-sold" : "bg-brand")} style={{ width: `${p.status === "error" ? 100 : p.progress}%` }} />
        </div>
      </div>
      {p.status === "error" ? (
        <Button size="md" variant="secondary" onClick={onRetry}>{he.app.retry}</Button>
      ) : (
        <Button size="md" variant="ghost" onClick={onCancel}>{he.app.cancel}</Button>
      )}
    </div>
  );
}
