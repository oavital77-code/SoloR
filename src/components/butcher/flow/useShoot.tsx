"use client";
// Taking a photo on a flow screen: the phone's camera (a file capture), fresh shots only, uploaded with a thumbnail and
// recorded in cut_media — for a tray (item_id) or for the parent itself (parent_id, the photos the block shows).
// "↺ צלם שוב" replaces the cover; "+ עוד תמונה" adds one.
import { useRef, useState } from "react";
import { useButcher } from "../ButcherShell";
import { useToast } from "../../Toast";
import { he } from "@/lib/i18n/he";
import { supabaseBrowser } from "@/lib/supabase/client";
import { mediaPath, prepareImage, removeStorageObjects, tusUpload } from "@/lib/upload";
import type { CutMedia } from "@/lib/types";

export const MAX_PHOTOS = 4;
const FRESH_MS = 15 * 60 * 1000;

export function useShoot(owner: { item_id: string } | { parent_id: string }, photos: CutMedia[], reload: () => Promise<unknown>) {
  const { butcher } = useButcher();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const replace = useRef(false);
  const [uploading, setUploading] = useState(0);

  async function shoot(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
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
      const full = mediaPath(butcher.id, "item_id" in owner ? owner.item_id : owner.parent_id, "jpg");
      const thumb = full.replace(/\.jpg$/, "_t.jpg");
      await tusUpload(img.full, full, "image/jpeg", () => {}).promise;
      await tusUpload(img.thumb, thumb, "image/jpeg", () => {}).promise;
      const { error } = await sb.from("cut_media").insert({
        ...owner, type: "photo", storage_path: full, thumb_path: thumb, is_cover: replace.current || photos.length === 0,
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

  const take = (again: boolean) => { replace.current = again; input.current?.click(); };
  const fileInput = (
    <input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { shoot(e.target.files); e.target.value = ""; }} />
  );
  return { take, uploading, fileInput };
}
