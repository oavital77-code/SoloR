"use client";
// Demo first screen (design: Splash): the symbol, the wordmark and the promise, then only "לקוח" or "קצב" (then
// which shop). No sign-up, no password.
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { he } from "@/lib/i18n/he";

type Shop = { id: string; name: string };

const big = "flex min-h-[60px] w-full items-center justify-center rounded-2xl font-display text-[22px] font-bold transition-transform active:scale-[0.98]";

export function DemoChooser({ shops, next, failed }: { shops: Shop[]; next: string; failed: boolean }) {
  const [step, setStep] = useState<"role" | "shop">("role");
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col overflow-hidden bg-ink px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center text-ivory">
      <div className="absolute inset-0 [background:radial-gradient(90%_55%_at_50%_0%,rgb(163_18_42/0.38),transparent_70%)]" aria-hidden />
      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/symbol.svg" alt="" className="size-28" />
        <Logo height={44} />
        <p className="m-0 max-w-[300px] font-display text-[22px] font-medium leading-8 [text-wrap:balance]">{he.app.tagline}</p>
      </div>

      {/* each choice is a plain form post, so it works before any script has loaded; while it is on its
          way the buttons stop taking taps (not `disabled`, which would drop the pressed button's value) */}
      <form action="/auth/demo" method="post" onSubmit={() => setBusy(true)} aria-busy={busy}
        className={"relative flex flex-col gap-3" + (busy ? " pointer-events-none opacity-70" : "")}>
        <input type="hidden" name="next" value={next} />
        {step === "role" ? (
          <>
            <button type="submit" name="as" value="customer" className={big + " bg-ivory text-ink"}>
              {he.auth.asCustomer}
            </button>
            <button type="button" onClick={() => setStep("shop")} className={big + " text-ivory ring-1 ring-line-gold ring-inset"}>
              {he.auth.asButcher}
            </button>
          </>
        ) : (
          <>
            <p className="sr-eyebrow m-0 mb-1">{he.auth.pickShop}</p>
            <input type="hidden" name="as" value="butcher" />
            {shops.map((s) => (
              <button key={s.id} type="submit" name="shop" value={s.id} className={big + " bg-ivory text-ink text-xl"}>
                {s.name}
              </button>
            ))}
            <button type="button" onClick={() => setStep("role")}
              className="min-h-11 py-2 text-[15px] text-ivory/60 underline-offset-4 hover:underline">
              {he.auth.back}
            </button>
          </>
        )}
        <span className="sr-proto mt-2 self-center">{he.auth.demoNote}</span>
        {failed && <p role="alert" className="rounded-2xl bg-red-900/60 px-4 py-3 font-semibold">{he.auth.demoFailed}</p>}
      </form>
    </main>
  );
}
