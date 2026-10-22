"use client";
// S0 — the butcher's home (BUTCHER_FLOW §5): "נתח חדש — התחל הקלטה", the cut in work (R16: everything is kept,
// "המשך" returns to exactly where it was; 🗑 deletes it), "סרוק פתק" for a sale at the counter (S9), and two tabs: what is in the
// showcase and the orders. ("סרוק פתק" is a typed number for now: no scanning, 22.10.2026.)
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Logo } from "@/components/Logo";
import { useButcher } from "@/components/butcher/ButcherShell";
import { OrderList } from "@/components/butcher/OrderList";
import { Showcase } from "@/components/butcher/Showcase";
import { parentStep } from "@/components/butcher/flow/FlowScreen";
import { RemoveParent } from "@/components/butcher/flow/RemoveParent";
import { Toggle } from "@/components/ui";
import { he } from "@/lib/i18n/he";
import { cutTitle } from "@/lib/cut-helpers";
import { useBreeds, useRefetchOnFocus } from "@/lib/hooks";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Parent } from "@/lib/types";

type Open = Parent & { items: { kind: string }[] };

function ButcherHome() {
  const { butcher, newOrders, sound, setSound } = useButcher();
  const breeds = useBreeds();
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "orders" ? "orders" : "showcase";
  const [open, setOpen] = useState<Open[]>([]);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("parents").select("*, items(kind)")
      .eq("butcher_id", butcher.id).neq("status", "closed").order("created_at", { ascending: false });
    setOpen((data ?? []) as Open[]);
  }, [butcher.id]);
  useEffect(() => { load(); }, [load]);
  useRefetchOnFocus(load);

  return (
    <main className="pb-6">
      <header className="sticky top-0 z-30 bg-ink/95 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <Logo height={22} light />
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="m-0 truncate text-[15px] font-semibold">{butcher.name}</h1>
            <form action="/auth/signout" method="post">
              <button className="min-h-11 px-1 text-sm font-semibold text-stone">{he.butcher.logout}</button>
            </form>
          </div>
        </div>
        <Toggle label={he.butcher.soundAlerts} checked={sound} onChange={setSound} />
        <div className="mt-2 flex flex-col gap-2 lg:mx-auto lg:max-w-[560px]">
          <Link href="/butcher/parent/new" className="sr-cbtn sr-cbtn--new active:scale-[0.99]">{he.flow.newCut}</Link>
          {open.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <Link href={parentStep(p)}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl border-2 border-dashed border-[var(--status-prep)] bg-ink-2 px-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold text-[var(--status-prep)]">{p.paused_at ? he.flow.paused : he.flow.inWork}</span>
                  <span className="block truncate text-[17px] font-bold">
                    {p.code != null ? `${p.code} · ` : ""}{he.flow.inWorkLine(cutTitle(p, breeds) || he.flow.noTitle, p.items.filter((i) => i.kind === "unit").length)}
                  </span>
                </span>
                <span className="sr-cchip !min-h-11 shrink-0">{he.flow.resume}</span>
              </Link>
              <RemoveParent parentId={p.id} code={p.code} onRemoved={load} className="!size-16 !rounded-2xl" />
            </div>
          ))}
          <Link href="/butcher/scan" className="sr-cbtn sr-cbtn--quiet">{he.flow.storeSale}</Link>
        </div>
        <Link href="/butcher/photo-guide" className="mt-1 flex min-h-11 items-center justify-center text-sm font-semibold text-stone underline underline-offset-4">
          {he.photoGuide.title}
        </Link>
        <nav className="sr-ctabs mt-1 lg:mx-auto lg:max-w-[560px]" role="tablist">
          {(["showcase", "orders"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t}
              onClick={() => router.replace(t === "orders" ? "/butcher?tab=orders" : "/butcher")}
              className="relative transition-colors">
              {t === "showcase" ? he.flow.tabShowcase : he.flow.tabOrders}
              {t === "orders" && newOrders > 0 && <span className="sr-cbadge">{newOrders}</span>}
            </button>
          ))}
        </nav>
      </header>
      {tab === "showcase" ? <Showcase /> : <OrderList />}
    </main>
  );
}

export default function Page() {
  return <Suspense><ButcherHome /></Suspense>;
}
