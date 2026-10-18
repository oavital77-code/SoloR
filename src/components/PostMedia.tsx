"use client";
// The post's media carousel (customer spec §5.2.3): the final photo first, then the other photos, then the
// work video. Dots and a 1/4 counter. The video is only loaded when its slide is near, plays muted while it
// is the visible slide of a post on screen, and a tap turns the sound on. On the full post a tap on a photo
// opens it full screen; in the feed it opens the post.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { PhotoViewer } from "./PhotoViewer";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import type { CutMedia } from "@/lib/types";
import { track as logEvent } from "@/lib/track";

export function PostMedia({ media, title, code, href, eager, state, children }: {
  media: CutMedia[]; title: string; code: string;
  /** feed: a tap on a photo opens this post; full post: undefined → full-screen viewer */
  href?: string; eager?: boolean; children?: React.ReactNode;
  /** sold: the photos lose their colour under the stamp; reserved: they dim (design system: PostStates) */
  state?: "sold" | "reserved" | null;
}) {
  const photos = photosOf(media);
  const video = videoOf(media);
  const slides: CutMedia[] = [...photos, ...(video ? [video] : [])];
  const [active, setActive] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const [sound, setSound] = useState(false);
  const [viewer, setViewer] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const videoEl = useRef<HTMLVideoElement>(null);
  const videoIndex = video ? slides.length - 1 : -1;

  // slide index from the scroll position (RTL-safe: scrollLeft is negative in right-to-left containers)
  const onScroll = () => {
    const t = track.current;
    if (t) setActive(Math.round(Math.abs(t.scrollLeft) / t.clientWidth));
  };

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // measurement (§15): which slide was swiped to, and how long the video played
  const cutId = media[0]?.cut_id;
  const lastSlide = useRef(0);
  useEffect(() => {
    if (!cutId || active === lastSlide.current) return;
    lastSlide.current = active;
    logEvent("media_swipe", { cut_id: cutId, index: active });
  }, [active, cutId]);

  const playing = active === videoIndex && onScreen;
  const playedAt = useRef<number | null>(null);
  useEffect(() => {
    if (!cutId) return;
    if (playing) { playedAt.current = Date.now(); return; }
    if (playedAt.current !== null) {
      logEvent("video_play", { cut_id: cutId, index: videoIndex, watched_ms: Date.now() - playedAt.current });
      playedAt.current = null;
    }
  }, [playing, cutId, videoIndex]);
  useEffect(() => {
    const v = videoEl.current;
    if (!v) return;
    if (playing) v.play().catch(() => {});
    else v.pause();
  }, [playing]);

  if (slides.length === 0) return <div ref={box} className="relative aspect-square w-full bg-ink-3">{children}</div>;

  return (
    <div ref={box} className="relative overflow-hidden bg-ink-3">
      {/* horizontal-only strip in a fixed-ratio box: a vertical swipe always scrolls the page (iOS) */}
      <div className="relative aspect-square w-full">
        <div ref={track} onScroll={onScroll} className={clsx("no-scrollbar absolute inset-0 flex snap-x snap-mandatory overflow-x-auto overflow-y-hidden transition-[filter] duration-[600ms]",
          state === "sold" && "grayscale brightness-[.55]", state === "reserved" && "brightness-[.8]")}>
          {slides.map((m, i) => (
            <div key={m.id} className="relative h-full w-full shrink-0 snap-center bg-black">
              {m.type === "video" ? (
                // not even fetched until the customer swipes next to it
                Math.abs(active - i) <= 1 && (
                  <button type="button" className="h-full w-full" aria-label={sound ? he.post.video : he.post.soundOn}
                    onClick={() => { const v = videoEl.current; if (v) { v.muted = false; setSound(true); v.play().catch(() => {}); } }}>
                    <video ref={videoEl} src={mediaUrl(m.storage_path)} poster={mediaUrl(m.poster_path ?? photos[0]?.storage_path)}
                      muted={!sound} playsInline loop preload="metadata" className="h-full w-full object-contain" aria-label={he.post.video} />
                    {!sound && (
                      <span className="pointer-events-none absolute bottom-10 start-3 rounded-full bg-ink/60 px-3 py-1 text-xs text-ivory backdrop-blur-sm">
                        {he.post.soundOn}
                      </span>
                    )}
                  </button>
                )
              ) : href ? (
                <Link href={href} tabIndex={-1} className="block h-full w-full" aria-label={he.cut.mediaAlt(title, code, i + 1)}>
                  <Photo m={m} title={title} code={code} i={i} eager={eager && i === 0} />
                </Link>
              ) : (
                <button type="button" className="h-full w-full" onClick={() => setViewer(i)} aria-label={he.cut.mediaAlt(title, code, i + 1)}>
                  <Photo m={m} title={title} code={code} i={i} eager={eager && i === 0} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          <span className="pointer-events-none absolute bottom-3 end-3 rounded-full bg-scrim px-2.5 py-0.5 text-xs text-ivory" dir="ltr">
            {he.post.counter(active + 1, slides.length)}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-[18px] flex justify-center gap-1.5" aria-hidden>
            {slides.map((m, i) => <span key={m.id} className={clsx("h-1.5 rounded-full transition-all", i === active ? "w-[18px] bg-ivory" : "w-1.5 bg-ivory/40")} />)}
          </div>
        </>
      )}
      {children}
      {viewer != null && photos[viewer] && (
        <PhotoViewer photos={photos} start={viewer} title={title} code={code} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function Photo({ m, title, code, i, eager }: { m: CutMedia; title: string; code: string; i: number; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(m.storage_path)}
      srcSet={m.thumb_path ? `${mediaUrl(m.thumb_path)} 640w, ${mediaUrl(m.storage_path)} 2000w` : undefined}
      sizes="(max-width: 480px) 100vw, 480px"
      alt={he.cut.mediaAlt(title, code, i + 1)}
      loading={eager ? "eager" : "lazy"}
      className="h-full w-full object-cover"
    />
  );
}
