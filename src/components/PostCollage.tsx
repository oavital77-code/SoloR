"use client";
// Feed media in the founders' reference layout (a social-feed post, 18.10.2026): edge to edge, the final photo
// large on top and a row of up to three smaller tiles under it — the other photos and the work video (with a play
// mark); "+N" on the last tile when there is more. Every tile opens the full post, where the video plays.
import Link from "next/link";
import { clsx } from "clsx";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import type { CutMedia } from "@/lib/types";

export function PostCollage({ media, title, code, href, eager, children }: {
  media: CutMedia[]; title: string; code: string; href: string; eager?: boolean; children?: React.ReactNode;
}) {
  const photos = photosOf(media);
  const video = videoOf(media);
  const main = photos[0];
  const rest: CutMedia[] = [...photos.slice(1), ...(video ? [video] : [])];
  const tiles = rest.slice(0, 3);
  const extra = rest.length - tiles.length;

  if (!main) return <div className="relative aspect-square w-full bg-ink-3">{children}</div>;

  return (
    <div className="relative">
      <Link href={href} className="relative block aspect-square w-full bg-ink-3" aria-label={he.cut.mediaAlt(title, code, 1)}>
        <Img m={main} alt={he.cut.mediaAlt(title, code, 1)} eager={eager} />
        {children}
      </Link>
      {tiles.length > 0 && (
        <div className={clsx("mt-0.5 grid gap-0.5", tiles.length === 1 ? "grid-cols-1" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
          {tiles.map((m, i) => (
            <Link key={m.id} href={href} className={clsx("relative block bg-ink-3", tiles.length === 1 ? "aspect-[16/9]" : tiles.length === 2 ? "aspect-[4/3]" : "aspect-square")}
              aria-label={m.type === "video" ? he.post.video : he.cut.mediaAlt(title, code, i + 2)}>
              {m.type === "video" ? (
                <>
                  {(m.poster_path || main) && <Img m={{ ...m, storage_path: m.poster_path ?? main.storage_path, thumb_path: m.poster_path ? null : main.thumb_path }} alt="" />}
                  <span className="absolute inset-0 grid place-items-center bg-black/25" aria-hidden>
                    <span className="grid size-11 place-items-center rounded-full bg-ink/70 ring-1 ring-ivory/40 backdrop-blur-sm">
                      <svg viewBox="0 0 24 24" className="ms-0.5 size-5 fill-ivory"><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></svg>
                    </span>
                  </span>
                </>
              ) : <Img m={m} alt={he.cut.mediaAlt(title, code, i + 2)} />}
              {i === tiles.length - 1 && extra > 0 && (
                <span className="absolute inset-0 grid place-items-center bg-black/55 font-display text-2xl font-bold text-ivory" dir="ltr">+{extra}</span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Img({ m, alt, eager }: { m: CutMedia; alt: string; eager?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaUrl(m.storage_path)}
      srcSet={m.thumb_path ? `${mediaUrl(m.thumb_path)} 640w, ${mediaUrl(m.storage_path)} 2000w` : undefined}
      sizes="(max-width: 480px) 100vw, 480px"
      alt={alt} loading={eager ? "eager" : "lazy"}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}
