"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useButcher } from "@/components/butcher/ButcherShell";
import { CutList } from "@/components/butcher/CutList";
import { OrderList } from "@/components/butcher/OrderList";
import { Toggle } from "@/components/ui";
import { he } from "@/lib/i18n/he";

function ButcherHome() {
  const { butcher, newOrders, sound, setSound } = useButcher();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "orders" ? "orders" : "cuts";

  return (
    <main className="pb-6">
      <header className="sticky top-0 z-30 bg-ink/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Logo height={22} light />
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="m-0 truncate text-[15px] font-semibold">{butcher.name}</h1>
            <form action="/auth/signout" method="post">
              <button className="min-h-11 px-1 text-sm font-semibold text-stone">
                {he.butcher.logout}
              </button>
            </form>
          </div>
        </div>
        <Toggle label={he.butcher.soundAlerts} checked={sound} onChange={setSound} />
        <Link
          href="/butcher/cuts/new"
          className="sr-cbtn sr-cbtn--new mt-2 active:scale-[0.99] lg:mx-auto lg:max-w-[480px]"
        >
          {he.butcher.newCut}
        </Link>
        <Link href="/butcher/photo-guide" className="mt-2 flex min-h-11 items-center justify-center text-sm font-semibold text-stone underline underline-offset-4">
          {he.photoGuide.title}
        </Link>
        <nav className="sr-ctabs mt-1 lg:mx-auto lg:max-w-[480px]" role="tablist">
          {(["cuts", "orders"] as const).map((t) => (
            <button
              key={t} role="tab" aria-selected={tab === t}
              onClick={() => router.replace(t === "orders" ? "/butcher?tab=orders" : "/butcher")}
              className="relative transition-colors"
            >
              {t === "cuts" ? he.butcher.tabCuts : he.butcher.tabOrders}
              {t === "orders" && newOrders > 0 && (
                <span className="sr-cbadge">{newOrders}</span>
              )}
            </button>
          ))}
        </nav>
      </header>
      {tab === "cuts" ? <CutList /> : <OrderList />}
    </main>
  );
}

export default function Page() {
  return <Suspense><ButcherHome /></Suspense>;
}
