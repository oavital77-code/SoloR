"use client";
// Feed media (design system: Post): the final photo at 4:3 with rounded corners inside the card, and under it a row
// of up to three short tiles — the other photos and the work video (a play mark), "+N" on the last when there is
// more. A photo that is not of this cut says "תמונת דוגמה". Sold: the photo loses its colour under the stamp;
// reserved: it dims under the badge. Every tile opens the full post, where the video plays.
import Link from "next/link";
import { clsx } from "clsx";
import { IconPlay } from "./icons";
import { he } from "@/lib/i18n/he";
import { mediaUrl, photosOf, videoOf } from "@/lib/cut-helpers";
import { isDemoMedia } from "@/lib/demo-credits";
import type { CutMedia } from "@/lib/types";

export function PostCollage({ media, title, code, href, eager, state, children }: {
  media: CutMedia[]; title: string; code: string; href: string; eager?: boolean;
  state?: "sold" | "reserved" | null; children?: React.ReactNode;
}) {
  const photos = photosOf(media);
  const video = videoOf(media);
  const main = photos[0];
  const rest: CutMedia[] = [...photos.slice(1), ...(video ? [video] : [])];
  const tiles = rest.slice(0, 3);
  const extra = rest.length - tiles.length;
  const sample = isDemoMedia(media);

  return (
    <>
      <Link href={href} aria-label={he.cut.mediaAlt(title, code, 1)}
        className={clsx("sr-media block", state === "sold" && "sr-media--sold", state === "reserved" && "sr-media--reserved")}>
        {main && <Img m={main} alt={he.cut.mediaAlt(title, code, 1)} eager={eager} />}
        {sample && !state && <span className="sr-media__sample">{he.post.sample}</span>}
        {children}
      </Link>
      {tiles.length > 0 && (
        <div className="sr-thumbs">
          {tiles.map((m, i) => (
            <Link key={m.id} href={href} className="sr-thumb" aria-label={m.type === "video" ? he.post.video : he.cut.mediaAlt(title, code, i + 2)}>
              {m.type === "video" ? (
                <>
                  {(m.poster_path || main) && <Img m={{ ...m, storage_path: m.poster_path ?? main.storage_path, thumb_path: m.poster_path ? null : main.thumb_path }} alt="" />}
                  <span className="sr-thumb__play"><IconPlay /></span>
                </>
              ) : <Img m={m} alt="" />}
              {i === tiles.length - 1 && extra > 0 && <span className="sr-thumb__more"><span className="ltr">+{extra}</span></span>}
            </Link>
          ))}
        </div>
      )}
    </>
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
    />
  );
}
