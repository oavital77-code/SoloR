"use client";
// Full-screen photo viewer of a post: swipe between photos with the thumbnails, tap to zoom, Esc / "סגור" to leave.
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { mediaUrl } from "@/lib/cut-helpers";
import type { CutMedia } from "@/lib/types";

export function PhotoViewer({ photos, start, title, code, onClose }: {
  photos: CutMedia[]; start: number; title: string; code: string; onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") { setI((x) => Math.min(photos.length - 1, x + 1)); setZoom(1); }
      if (e.key === "ArrowRight") { setI((x) => Math.max(0, x - 1)); setZoom(1); }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose, photos.length]);

  const p = photos[i];
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
        <span className="ltr text-sm opacity-70">{i + 1}/{photos.length}</span>
        <button className="min-h-11 px-2 text-sm tracking-wide text-ivory/85" onClick={onClose}>
          {he.app.close}
        </button>
      </div>
      <div className="flex-1 overflow-auto" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mediaUrl(p.storage_path)}
          alt={he.cut.mediaAlt(title, code, i + 1)}
          onClick={() => setZoom((z) => (z === 1 ? 2.5 : 1))}
          style={{ width: `${zoom * 100}%`, maxWidth: "none" }}
          className={clsx("mx-auto h-auto", zoom === 1 ? "cursor-zoom-in" : "cursor-zoom-out")}
        />
      </div>
      {photos.length > 1 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {photos.map((ph, k) => (
            <button key={ph.id} onClick={() => { setI(k); setZoom(1); }} className={clsx("size-14 shrink-0 overflow-hidden rounded-md", k === i ? "ring-1 ring-ivory" : "opacity-50")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(ph.thumb_path ?? ph.storage_path)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
