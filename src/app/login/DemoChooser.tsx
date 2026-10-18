"use client";
// Demo first screen: only "לקוח" or "קצב" (then which shop). No sign-up, no password.
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { he } from "@/lib/i18n/he";

type Shop = { id: string; name: string };

const big = "flex min-h-16 w-full items-center justify-center rounded-2xl font-display text-2xl font-bold transition-transform active:scale-[0.98]";

export function DemoChooser({ shops, next, failed }: { shops: Shop[]; next: string; failed: boolean }) {
  const [step, setStep] = useState<"role" | "shop">("role");
  const [busy, setBusy] = useState(false);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[480px] flex-col justify-end overflow-hidden bg-ink px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-center text-ivory">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(200,16,46,0.4),transparent_60%)]" aria-hidden />
      <div className="relative mb-auto pt-[20dvh]">
        <Logo className="text-6xl" />
        <p className="mt-4 text-xl font-semibold leading-snug text-ivory/85">{he.app.tagline}</p>
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
            <button type="button" onClick={() => setStep("shop")} className={big + " text-ivory ring-1 ring-ivory/30"}>
              {he.auth.asButcher}
            </button>
          </>
        ) : (
          <>
            <p className="eyebrow mb-1">{he.auth.pickShop}</p>
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
        {failed && <p role="alert" className="rounded-2xl bg-red-900/60 px-4 py-3 font-semibold">{he.auth.demoFailed}</p>}
      </form>
    </main>
  );
}
