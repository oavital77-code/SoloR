"use client";
// Media upload helpers: client-side image compression, video checks/poster, resumable (TUS) upload to Supabase Storage.
import imageCompression from "browser-image-compression";
import * as tus from "tus-js-client";
import { MEDIA_BUCKET } from "./cut-helpers";
import { supabaseBrowser } from "./supabase/client";
import { MEDIA_LIMITS } from "./validation";

export interface UploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

/** Resumable upload with progress; retries automatically when the connection drops. */
export function tusUpload(file: Blob, objectPath: string, contentType: string, onProgress: (pct: number) => void): UploadHandle {
  let upload: tus.Upload | null = null;
  let aborted = false;
  const promise = (async () => {
    const sb = supabaseBrowser();
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error("NO_SESSION");
    await new Promise<void>((resolve, reject) => {
      upload = new tus.Upload(file, {
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: MEDIA_BUCKET, objectName: objectPath, contentType, cacheControl: "31536000" },
        chunkSize: 6 * 1024 * 1024, // required by Supabase
        onError: (err) => reject(err),
        onProgress: (sent, total) => onProgress(total ? Math.round((sent / total) * 100) : 0),
        onSuccess: () => resolve(),
      });
      upload.findPreviousUploads().then((prev) => {
        if (aborted) return reject(new Error("ABORTED"));
        if (prev.length) upload!.resumeFromPreviousUpload(prev[0]);
        upload!.start();
      });
    });
  })();
  return {
    promise,
    abort: () => {
      aborted = true;
      (upload as tus.Upload | null)?.abort(true);
    },
  };
}

export interface PreparedImage {
  full: File;
  thumb: File;
  width: number;
  height: number;
}

/** Compress to ≤2000px JPEG q0.82 (+ a 640px thumbnail). EXIF orientation is applied by the browser/library. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  const opts = { initialQuality: MEDIA_LIMITS.imageQuality, fileType: "image/jpeg", useWebWorker: true };
  const full = await imageCompression(file, { ...opts, maxWidthOrHeight: MEDIA_LIMITS.imageMaxSide, maxSizeMB: 3 });
  const thumb = await imageCompression(full, { ...opts, maxWidthOrHeight: MEDIA_LIMITS.thumbMaxSide, maxSizeMB: 0.25 });
  let width = 0, height = 0;
  try {
    const bmp = await createImageBitmap(full);
    width = bmp.width; height = bmp.height;
    bmp.close();
  } catch { /* dimensions are optional */ }
  return { full, thumb, width, height };
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
  poster: Blob | null;
}

/** Reads duration (and tries to grab the first frame as a poster). */
export function inspectVideo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = url;
    let done = false;
    const finish = (poster: Blob | null) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, poster });
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error("VIDEO_UNREADABLE")); };
    v.onloadedmetadata = () => {
      // try to grab a frame; give up after 4s (some codecs can't be decoded on every browser)
      const timer = window.setTimeout(() => finish(null), 4000);
      v.onseeked = () => {
        try {
          const scale = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
          const c = document.createElement("canvas");
          c.width = Math.round(v.videoWidth * scale);
          c.height = Math.round(v.videoHeight * scale);
          c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
          c.toBlob((b) => { window.clearTimeout(timer); finish(b); }, "image/jpeg", 0.8);
        } catch {
          window.clearTimeout(timer);
          finish(null);
        }
      };
      v.currentTime = Math.min(0.1, (v.duration || 1) / 2);
    };
  });
}

export function extOf(file: File, fallback: string): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return fallback;
}

export function mediaPath(butcherId: string, cutId: string, ext: string): string {
  return `${butcherId}/${cutId}/${crypto.randomUUID()}.${ext}`;
}

export async function removeStorageObjects(paths: (string | null | undefined)[]) {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabaseBrowser().storage.from(MEDIA_BUCKET).remove(list);
}
