"use client";
// A cut and what was taken of it (founders 22.10.2026: the cart and the orders as in the feed): the cut's photo,
// name and number on top, its lines — a tray, the block, a slice — hanging off it on a dashed rail.
import Link from "next/link";
import { clsx } from "clsx";
import { mediaUrl } from "@/lib/cut-helpers";
import type { CutMedia } from "@/lib/types";

/** The rows of each cut together, in the order each cut first appears. */
export function groupByCut<T>(rows: T[], key: (r: T) => string): { key: string; rows: T[] }[] {
  const out: { key: string; rows: T[] }[] = [];
  for (const r of rows) {
    const k = key(r);
    const g = out.find((x) => x.key === k);
    if (g) g.rows.push(r); else out.push({ key: k, rows: [r] });
  }
  return out;
}

export function CutGroup({ cover, title, code, href, last, dim, children }: {
  cover: CutMedia | undefined; title: string;
  /** "נתח 09" */
  code: string;
  href?: string;
  last?: boolean;
  /** everything of it cancelled or sold */
  dim?: boolean;
  children: React.ReactNode;
}) {
  const head = (
    <>
      <span className={clsx("block size-12 shrink-0 overflow-hidden rounded-lg bg-ink-3", dim && "opacity-50 grayscale")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img src={mediaUrl(cover.thumb_path ?? cover.storage_path)} alt="" className="h-full w-full object-cover" loading="lazy" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-semibold leading-5">{title}</span>
        <span className="block text-[13px] text-stone">{code}</span>
      </span>
    </>
  );
  return (
    <li className={clsx("flex flex-col gap-1 border-b border-line py-3", last && "!border-b-0")}>
      {href ? <Link href={href} className="flex items-center gap-3">{head}</Link> : <div className="flex items-center gap-3">{head}</div>}
      <ul className="m-0 ms-5 flex list-none flex-col border-s-2 border-dashed border-stone/40 p-0 ps-3">{children}</ul>
    </li>
  );
}
