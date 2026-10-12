"use client";
// C2 — one full-screen Reels-style card.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Volume2, VolumeX } from "lucide-react";
import { clsx } from "clsx";
import { Ltr } from "../ui";
import { he } from "@/lib/i18n/he";
import { canBuySteaks, canBuyWhole, cutTitle, isNew, mediaUrl, originAgingLine, photosOf, videoOf } from "@/lib/cut-helpers";
import { formatAgorot, formatWeight } from "@/lib/pricing";
import type { Breed, CutWithMedia } from "@/lib/types";

export function FeedCard({ cut, breeds, muted, onToggleMute, fresh, eager, now }: {
  cut: CutWithMedia; breeds: Breed[]; muted: boolean; onToggleMute: () => void; fresh?: boolean; eager?: boolean; now: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const title = cutTitle(cut, breeds);
  const video = videoOf(cut.cut_media);
  const photos = photosOf(cut.cut_media);
  const soldOut = cut.status !== "published";

  // autoplay muted while on screen, pause when leaving
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (visible) v.play().catch(() => {});
    else v.pause();
  }, [visible]);

  return (
    <article ref={ref} className="relative h-full w-full snap-start snap-always overflow-hidden bg-black" aria-label={`${title} ${cut.code}`}>
      {video ? (
        <video
          ref={videoRef}
          src={mediaUrl(video.storage_path)}
          poster={mediaUrl(video.poster_path ?? photos[0]?.storage_path)}
          muted={muted} loop playsInline preload="metadata"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <PhotoSwiper photos={photos} title={title} code={cut.code} eager={eager} />
      )}

      {soldOut && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-neutral-900/70 grayscale">
          <span className="rotate-[-8deg] rounded-2xl border-4 border-white/80 px-6 py-2 text-5xl font-extrabold text-white/90">{he.feed.soldOut}</span>
        </div>
      )}

      {video && (
        <button type="button" onClick={onToggleMute} aria-label={muted ? he.feed.unmute : he.feed.mute}
          className="absolute end-3 top-[calc(4.5rem+env(safe-area-inset-top))] z-20 grid size-11 place-items-center rounded-full bg-black/45 text-white">
          {muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/70 to-transparent px-4 pt-24 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {isNew(cut, now) && !soldOut && (
              <span className={clsx("rounded-full bg-live px-2.5 py-0.5 text-xs font-extrabold", fresh && "animate-new-glow")}>{he.feed.newBadge}</span>
            )}
            {!soldOut && canBuySteaks(cut) && <Badge>{he.feed.steaksLeft(cut.steaks_available)}</Badge>}
            {!soldOut && canBuyWhole(cut) && <Badge>{he.feed.wholeAvailable}</Badge>}
            {cut.butcher_marbling && <Badge>{he.feed.butcherScore(cut.butcher_marbling)}</Badge>}
          </div>
          <h2 className="text-[28px] font-extrabold leading-tight drop-shadow">{title}</h2>
          <p className="text-[15px] text-white/85">{originAgingLine(cut)}</p>
          <p className="text-[15px] font-semibold text-white/90">
            {cut.weight_g && <Ltr>{formatWeight(cut.weight_g)}</Ltr>}
            {" · "}
            {cut.price_per_kg_agorot && <Ltr>₪{formatAgorot(cut.price_per_kg_agorot).replace(/\.00$/, "")}</Ltr>} {he.feed.perKg}
          </p>
          {!soldOut && (
            <Link href={`/cut/${cut.code}`} className="mt-2 flex min-h-14 items-center justify-center rounded-2xl bg-brand text-lg font-extrabold text-white shadow-lg active:scale-[0.99]">
              {he.feed.details}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-bold backdrop-blur">{children}</span>;
}

function PhotoSwiper({ photos, title, code, eager }: { photos: CutWithMedia["cut_media"]; title: string; code: string; eager?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const el = track.current;
    if (!el || photos.length < 2) return;
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(Number((e.target as HTMLElement).dataset.i))),
      { root: el, threshold: 0.6 },
    );
    el.querySelectorAll("[data-i]").forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [photos.length]);

  return (
    <>
      <div ref={track} className="no-scrollbar absolute inset-0 flex snap-x snap-mandatory overflow-x-auto">
        {photos.map((p, i) => (
          <div key={p.id} data-i={i} className="h-full w-full shrink-0 snap-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={mediaUrl(p.storage_path)}
              srcSet={p.thumb_path ? `${mediaUrl(p.thumb_path)} 640w, ${mediaUrl(p.storage_path)} 2000w` : undefined}
              sizes="(max-width: 480px) 100vw, 480px"
              alt={he.cut.mediaAlt(title, code, i + 1)}
              loading={eager && i === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
      {photos.length > 1 && (
        <div className="absolute inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-10 flex justify-center gap-1.5">
          {photos.map((p, i) => <span key={p.id} className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-white" : "w-1.5 bg-white/50")} />)}
        </div>
      )}
    </>
  );
}
