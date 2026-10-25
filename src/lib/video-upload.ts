"use client";
// The cutting video goes up in the background (BUTCHER_FLOW S1): the butcher moves on to the details while it
// uploads; the screens show a small progress bar. Kept outside React so moving between screens does not stop it.
import { useSyncExternalStore } from "react";
import { supabaseBrowser } from "./supabase/client";
import { bareType, extOf, inspectVideo, mediaPath, tusUpload } from "./upload";

export interface VideoUpload { parentId: string; pct: number; status: "uploading" | "done" | "error" }

let current: VideoUpload | null = null;
let retry: (() => void) | null = null;
const listeners = new Set<() => void>();
const set = (v: VideoUpload | null) => { current = v; listeners.forEach((l) => l()); };

export function uploadParentVideo(blob: Blob, butcherId: string, parentId: string) {
  // a recording made in the browser is a Blob without a name; the phone's camera gives a File
  const file = blob instanceof File ? blob
    : new File([blob], `rec.${blob.type.includes("mp4") ? "mp4" : "webm"}`, { type: bareType(blob.type) || "video/webm", lastModified: Date.now() });
  const run = async () => {
    set({ parentId, pct: 0, status: "uploading" });
    try {
      const info = await inspectVideo(file).catch(() => null);
      const path = mediaPath(butcherId, parentId, extOf(file, "mp4"));
      let poster: string | null = null;
      if (info?.poster) {
        poster = path.replace(/\.[a-z0-9]+$/, "_poster.jpg");
        await tusUpload(info.poster, poster, "image/jpeg", () => {}).promise.catch(() => { poster = null; });
      }
      const type = bareType(file.type) || (path.endsWith(".webm") ? "video/webm" : path.endsWith(".mov") ? "video/quicktime" : "video/mp4");
      await tusUpload(file, path, type, (pct) => set({ parentId, pct, status: "uploading" })).promise;
      const { error } = await supabaseBrowser().rpc("set_parent_video", { p_parent_id: parentId, p_video_path: path, p_poster_path: poster });
      if (error) throw error;
      set({ parentId, pct: 100, status: "done" });
      window.setTimeout(() => { if (current?.status === "done") set(null); }, 4000);
    } catch {
      set({ parentId, pct: 0, status: "error" });
    }
  };
  retry = run;
  run();
}

export const retryVideoUpload = () => retry?.();

export function useVideoUpload(): VideoUpload | null {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => listeners.delete(fn); }, () => current, () => null);
}
