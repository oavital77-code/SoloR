"use client";
// Cut page gallery: video first (full controls), then photos. Horizontal swipe, tap → fullscreen with zoom.
import { useEffect, useRef, useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import type { CutMedia } from "@/lib/types";

export function MediaGallery({ media, title, code }: { media: CutMedia[]; title: string; code: string }) {
  const video = videoOf(media);
  const photos = photosOf(media);
  const cover = photos[0];
  const slides: CutMedia[] = [...(video ? [video] : []), ...photos];
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { root: track, threshold: 0.6 },
    );
    track.querySelectorAll("[data-i]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [slides.length]);

  if (slides.length === 0) {
    return <div className="aspect-[4/5] w-full bg-ink-3" />;
  }

  const photoIndex = (i: number) => (video ? i - 1 : i);

  return (
    <div className="relative">
      <div ref={trackRef} className="no-scrollbar flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto bg-black">
        {slides.map((m, i) => (
          <div key={m.id} data-i={i} className="relative h-full w-full shrink-0 snap-center">
            {m.type === "video" ? (
              <video
                src={mediaUrl(m.storage_path)}
                poster={mediaUrl(m.poster_path ?? cover?.storage_path)}
                controls playsInline preload="metadata"
                className="h-full w-full object-contain"
                aria-label={he.cut.video}
              />
            ) : (
              <button type="button" className="h-full w-full" onClick={() => setViewer(photoIndex(i))} aria-label={he.cut.mediaAlt(title, code, photoIndex(i) + 1)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaUrl(m.storage_path)}
                  alt={he.cut.mediaAlt(title, code, photoIndex(i) + 1)}
                  className="h-full w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
                <ZoomIn className="absolute bottom-3 start-3 size-5 text-white/70 drop-shadow" aria-hidden />
              </button>
            )}
          </div>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((m, i) => (
            <span key={m.id} className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-white" : "w-1.5 bg-white/50")} />
          ))}
        </div>
      )}
      {viewer != null && photos[viewer] && (
        <PhotoViewer photos={photos} start={viewer} title={title} code={code} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function PhotoViewer({ photos, start, title, code, onClose }: {
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
        <button className="grid size-11 place-items-center rounded-full bg-white/10" onClick={onClose} aria-label={he.app.close}>
          <X className="size-6" />
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
            <button key={ph.id} onClick={() => { setI(k); setZoom(1); }} className={clsx("size-14 shrink-0 overflow-hidden rounded-xl", k === i ? "ring-2 ring-white" : "opacity-60")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl(ph.thumb_path ?? ph.storage_path)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
