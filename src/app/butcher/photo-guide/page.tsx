"use client";
// How to photograph a cut for SoloR (design: Photo). The customer buys what is in the picture, so the guide shows
// three right shots and three wrong ones — the wrong ones are the same photos with the mistake applied (flash,
// the counter's red lamp, cropping) — then the four rules for the second photo, the video and what never to do.
import Link from "next/link";
import { clsx } from "clsx";
import { IconBack, IconCheck, IconClose } from "@/components/icons";
import { he } from "@/lib/i18n/he";
import { Rise } from "@/components/motion/Rise";

const SHOTS: { src: string; ok: boolean; title: string; text: string; style?: React.CSSProperties }[] = [
  { src: "/demo/d01/1.jpg", ok: true, ...he.photoGuide.shots[0] },
  { src: "/demo/d02/1.jpg", ok: true, ...he.photoGuide.shots[1] },
  { src: "/demo/d05/1.jpg", ok: true, ...he.photoGuide.shots[2] },
  { src: "/demo/d01/1.jpg", ok: false, ...he.photoGuide.shots[3], style: { filter: "brightness(1.7) contrast(.75) saturate(.6)" } },
  { src: "/demo/d02/1.jpg", ok: false, ...he.photoGuide.shots[4], style: { filter: "sepia(.6) saturate(2.4) hue-rotate(-20deg) brightness(1.05)" } },
  { src: "/demo/d05/1.jpg", ok: false, ...he.photoGuide.shots[5], style: { transform: "scale(2.4) translate(-14%, 10%)" } },
];

export default function PhotoGuidePage() {
  return (
    <main className="flex min-h-dvh flex-col gap-6 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12 text-start lg:mx-auto lg:max-w-[960px] lg:px-8">
      <header className="flex items-start gap-2">
        <Link href="/butcher" aria-label={he.app.back} className="sr-backbtn !bg-transparent"><IconBack /></Link>
        <div className="flex flex-col gap-1.5">
          <span className="sr-eyebrow">{he.photoGuide.eyebrow}</span>
          <Rise lines={[he.photoGuide.title]} className="m-0 font-display text-[28px] font-black leading-9 lg:text-[38px] lg:leading-[44px]" />
          <p className="m-0 text-[15px] text-stone">{he.photoGuide.lead}</p>
        </div>
      </header>

      <ul className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-5 p-0 lg:grid-cols-3 lg:gap-5">
        {SHOTS.map((s, i) => (
          <li key={i} className="flex flex-col gap-1.5">
            <figure className="relative m-0 aspect-[4/3] overflow-hidden rounded-[14px] bg-[#1c1815]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" className="block h-full w-full object-cover" style={s.style} />
              <span className={clsx("absolute top-2 end-2 grid size-[30px] place-items-center rounded-full text-white", s.ok ? "bg-success" : "bg-sold")}
                aria-label={s.ok ? he.photoGuide.yes : he.photoGuide.no}>
                {s.ok ? <IconCheck className="!size-[18px]" /> : <IconClose className="!size-4" />}
              </span>
            </figure>
            <b className="text-[15px]">{s.title}</b>
            <span className="text-[13px] leading-[18px] text-stone">{s.text}</span>
          </li>
        ))}
      </ul>

      <div className="grid gap-x-8 gap-y-3 border-t border-line pt-4 lg:grid-cols-2">
        {he.photoGuide.rules.map(([b, t]) => (
          <p key={b} className="m-0 text-[15px] leading-[22px]"><b>{b}</b> {t}</p>
        ))}
      </div>
      <p className="m-0 text-xs text-stone">{he.photoGuide.credit}</p>
    </main>
  );
}
