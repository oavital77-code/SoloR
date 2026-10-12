"use client";
// Wizard step 1: take photos / video, per-file progress, cover selection, ordering, delete, retry.
import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, Images, RotateCcw, Star, Video, X } from "lucide-react";
import { clsx } from "clsx";
import { Button, Ltr } from "../ui";
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

export function MediaUploader({ cutId, butcherId, media, onChange, disabled }: {
  cutId: string; butcherId: string; media: CutMedia[]; onChange: () => Promise<void> | void; disabled?: boolean;
}) {
  const toast = useToast();
  const [pending, setPending] = useState<Pending[]>([]);
  const camPhoto = useRef<HTMLInputElement>(null);
  const camVideo = useRef<HTMLInputElement>(null);
  const galPhoto = useRef<HTMLInputElement>(null);
  const galVideo = useRef<HTMLInputElement>(null);

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

  function addFiles(files: FileList | null, kind: "photo" | "video") {
    if (!files?.length) return;
    if (kind === "photo") {
      const room = MEDIA_LIMITS.maxPhotos - photos.length - pendingPhotos;
      const list = Array.from(files).slice(0, Math.max(0, room));
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

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3">
        <Button size="xl" onClick={() => camPhoto.current?.click()} disabled={disabled || photos.length + pendingPhotos >= MEDIA_LIMITS.maxPhotos}>
          <Camera className="size-6" /> {he.wizard.takePhoto}
        </Button>
        <Button size="lg" variant="secondary" onClick={() => camVideo.current?.click()} disabled={disabled || !!video || pendingVideo}>
          <Video className="size-5" /> {he.wizard.takeVideo}
        </Button>
        <div className="flex justify-center gap-4 text-[15px] font-semibold text-brand">
          <button type="button" className="min-h-11 underline underline-offset-4 disabled:opacity-40" disabled={disabled} onClick={() => galPhoto.current?.click()}>
            <Images className="me-1 inline size-4" />{he.wizard.galleryPhotos}
          </button>
          <button type="button" className="min-h-11 underline underline-offset-4 disabled:opacity-40" disabled={disabled || !!video || pendingVideo} onClick={() => galVideo.current?.click()}>
            {he.wizard.galleryVideo}
          </button>
        </div>
      </div>

      <input ref={camPhoto} hidden type="file" accept="image/*" capture="environment" multiple onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
      <input ref={camVideo} hidden type="file" accept="video/*" capture="environment" onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />
      <input ref={galPhoto} hidden type="file" accept="image/*" multiple onChange={(e) => { addFiles(e.target.files, "photo"); e.target.value = ""; }} />
      <input ref={galVideo} hidden type="file" accept="video/*" onChange={(e) => { addFiles(e.target.files, "video"); e.target.value = ""; }} />

      {(ordered.length > 0 || pending.length > 0) && <p className="text-sm text-neutral-500">{he.wizard.coverHint}</p>}

      <ul className="grid grid-cols-3 gap-2">
        {ordered.map((m, i) => (
          <li key={m.id} className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-200">
            <button type="button" className="h-full w-full" onClick={() => setCover(m)} aria-label={he.wizard.cover}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(m.thumb_path ?? m.storage_path)} alt="" className="h-full w-full object-cover" />
            </button>
            {m.id === coverId && (
              <span className="absolute top-1.5 start-1.5 flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
                <Star className="size-3 fill-current" /> {he.wizard.cover}
              </span>
            )}
            <button type="button" onClick={() => remove(m)} disabled={disabled} aria-label={he.wizard.remove}
              className="absolute top-1 end-1 grid size-9 place-items-center rounded-full bg-black/60 text-white">
              <X className="size-4" />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button type="button" onClick={() => move(m, -1)} disabled={i === 0 || disabled} aria-label={he.wizard.moveEarlier}
                className="grid size-9 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0">
                <ArrowRight className="size-4" />
              </button>
              <button type="button" onClick={() => move(m, 1)} disabled={i === ordered.length - 1 || disabled} aria-label={he.wizard.moveLater}
                className="grid size-9 place-items-center rounded-full bg-black/60 text-white disabled:opacity-0">
                <ArrowLeft className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {pending.filter((p) => p.kind === "photo").map((p) => <PendingTile key={p.key} p={p} onRetry={() => retry(p)} onCancel={() => { p.abort?.(); drop(p.key); }} />)}
      </ul>

      {(video || pendingVideo) && (
        <div className="flex flex-col gap-2">
          <p className="font-bold">{he.cut.video}</p>
          {video && (
            <div className="relative overflow-hidden rounded-2xl bg-black">
              <video src={mediaUrl(video.storage_path)} poster={mediaUrl(video.poster_path)} controls playsInline preload="metadata" className="max-h-72 w-full" />
              <button type="button" onClick={() => remove(video)} disabled={disabled} aria-label={he.wizard.remove}
                className="absolute top-2 end-2 grid size-10 place-items-center rounded-full bg-black/60 text-white">
                <X className="size-5" />
              </button>
            </div>
          )}
          {pending.filter((p) => p.kind === "video").map((p) => (
            <div key={p.key} className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200">
              <ProgressLine p={p} onRetry={() => retry(p)} onCancel={() => { p.abort?.(); drop(p.key); }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PendingTile({ p, onRetry, onCancel }: { p: Pending; onRetry: () => void; onCancel: () => void }) {
  return (
    <li className="relative aspect-square overflow-hidden rounded-2xl bg-neutral-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.preview} alt="" className="h-full w-full object-cover opacity-50" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-center">
        {p.status === "error" ? (
          <>
            <span className="text-xs font-bold text-red-700">{p.error}</span>
            <button type="button" onClick={onRetry} className="flex min-h-9 items-center gap-1 rounded-full bg-white px-3 text-sm font-bold shadow">
              <RotateCcw className="size-4" /> {he.app.retry}
            </button>
          </>
        ) : (
          <span className="text-sm font-bold"><Ltr>{p.status === "processing" ? he.wizard.processing : `${p.progress}%`}</Ltr></span>
        )}
      </div>
      {p.status !== "error" && (
        <div className="absolute inset-x-2 bottom-2 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${p.progress}%` }} />
        </div>
      )}
      <button type="button" onClick={onCancel} aria-label={he.wizard.cancelUpload} className="absolute top-1 end-1 grid size-9 place-items-center rounded-full bg-black/60 text-white">
        <X className="size-4" />
      </button>
    </li>
  );
}

function ProgressLine({ p, onRetry, onCancel }: { p: Pending; onRetry: () => void; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div className="mb-1 flex justify-between text-sm font-semibold">
          <span className={clsx(p.status === "error" && "text-red-700")}>
            {p.status === "error" ? p.error : p.status === "processing" ? he.wizard.processing : he.wizard.uploading}
          </span>
          {p.status === "uploading" && <Ltr>{p.progress}%</Ltr>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div className={clsx("h-full transition-[width]", p.status === "error" ? "bg-red-500" : "bg-brand")} style={{ width: `${p.status === "error" ? 100 : p.progress}%` }} />
        </div>
      </div>
      {p.status === "error" ? (
        <Button size="md" variant="secondary" onClick={onRetry}><RotateCcw className="size-4" />{he.app.retry}</Button>
      ) : (
        <Button size="md" variant="ghost" onClick={onCancel}>{he.app.cancel}</Button>
      )}
    </div>
  );
}
