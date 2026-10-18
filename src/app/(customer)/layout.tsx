import { Suspense } from "react";
import { AppHeader } from "@/components/customer/AppHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { CartBar } from "@/components/customer/CartBar";
import { CartSync } from "@/components/customer/CartSync";
import { Tracker } from "@/components/customer/Tracker";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-black lg:bg-ink">
      {/* phones and tablets: one column; a wide screen gets the full width (pages lay themselves out from lg) */}
      <div className="relative mx-auto min-h-dvh max-w-[480px] bg-ink text-center text-white lg:max-w-[1200px]">
        <AppHeader />
        {children}
        <CartBar />
        <CartSync />
        <Tracker />
        <Suspense><BottomNav /></Suspense>
      </div>
    </div>
  );
}
