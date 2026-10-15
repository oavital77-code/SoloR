"use client";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { clsx } from "clsx";
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
      <header className="sticky top-0 z-30 bg-neutral-50/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h1 className="truncate text-2xl font-extrabold">{butcher.name}</h1>
          <form action="/auth/signout" method="post">
            <button className="min-h-11 px-1 text-sm font-semibold text-neutral-500">
              {he.butcher.logout}
            </button>
          </form>
        </div>
        <Toggle label={he.butcher.soundAlerts} checked={sound} onChange={setSound} />
        <Link
          href="/butcher/cuts/new"
          className="mt-2 flex min-h-16 w-full items-center justify-center rounded-2xl bg-brand text-xl font-extrabold text-white shadow-md active:scale-[0.99]"
        >
          {he.butcher.newCut}
        </Link>
        <nav className="mt-3 grid grid-cols-2 rounded-2xl bg-neutral-200 p-1" role="tablist">
          {(["cuts", "orders"] as const).map((t) => (
            <button
              key={t} role="tab" aria-selected={tab === t}
              onClick={() => router.replace(t === "orders" ? "/butcher?tab=orders" : "/butcher")}
              className={clsx("relative min-h-12 rounded-xl text-[17px] font-bold transition-colors",
                tab === t ? "bg-white shadow-sm" : "text-neutral-600")}
            >
              {t === "cuts" ? he.butcher.tabCuts : he.butcher.tabOrders}
              {t === "orders" && newOrders > 0 && (
                <span className="ms-2 inline-grid min-w-6 place-items-center rounded-full bg-brand px-1.5 text-sm text-white" dir="ltr">{newOrders}</span>
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
