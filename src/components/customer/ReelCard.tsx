"use client";
// One full-screen reel: the butchering video of a single cut, a quiet caption, a hairline progress bar.
// Tapping the reel opens the cut itself (all the details and the order).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { cutTitle, mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import { formatAgorot } from "@/lib/pricing";
import type { Breed, Butcher, CutWithMedia } from "@/lib/types";

export function ReelCard({ cut, breeds, shop, muted, onToggleMute, onVisible }: {
  cut: CutWithMedia; breeds: Breed[]; shop?: Butcher | null; muted: boolean; onToggleMute: () => void;
  onVisible: (code: string) => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const title = cutTitle(cut, breeds);
  const video = videoOf(cut.cut_media);
  const poster = video?.poster_path ?? photosOf(cut.cut_media)[0]?.storage_path;
  const soldOut = cut.status !== "published";
  const href = `/cut/${cut.code}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (visible) onVisible(cut.code);
    if (!v) return;
    if (visible && !soldOut) v.play().catch(() => {});
    else v.pause();
  }, [visible, soldOut, cut.code, onVisible]);

  const open = () => { if (!soldOut) router.push(href); };

  return (
    <article ref={ref} data-code={cut.code} className="relative h-full w-full snap-start snap-always overflow-hidden bg-ink"
      aria-label={`${title} ${cut.code}`}>
      {video && (
        <video
          ref={videoRef}
          src={mediaUrl(video.storage_path)}
          poster={poster ? mediaUrl(poster) : undefined}
          muted={muted} loop playsInline preload="metadata"
          onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgress(v.currentTime / v.duration); }}
          onClick={open}
          className={clsx("absolute inset-0 h-full w-full cursor-pointer object-cover", soldOut && "grayscale")}
        />
      )}

      {soldOut && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-ink/60">
          <span className="font-display text-5xl font-bold tracking-wide text-ivory/90">{he.feed.soldOut}</span>
        </div>
      )}

      <button type="button" onClick={onToggleMute}
        className="absolute end-4 top-[calc(4rem+env(safe-area-inset-top))] z-20 min-h-10 px-1 text-[13px] text-ivory/80 drop-shadow">
        {muted ? he.feed.unmute : he.feed.mute}
      </button>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-ink via-ink/60 to-transparent px-5 pt-28 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto" onClick={open}>
          {shop && <p className="eyebrow">{shop.name}</p>}
          <h2 className="mt-1.5 font-display text-[30px] font-bold leading-[1.1] text-ivory drop-shadow">{title}</h2>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            {cut.price_per_kg_agorot ? (
              <p className="text-sm text-ivory/75">
                <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr> {he.feed.perKg}
              </p>
            ) : <span />}
            {!soldOut && (
              <span className="cursor-pointer border-b border-ivory/40 pb-0.5 text-sm font-medium text-ivory">{he.reels.details}</span>
            )}
          </div>
        </div>
        <div className="mt-4 h-px w-full bg-ivory/15" aria-hidden>
          <div className="h-px bg-ivory/80" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
        </div>
      </div>
    </article>
  );
}
