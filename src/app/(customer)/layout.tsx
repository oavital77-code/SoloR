import { Suspense } from "react";
import { AppHeader } from "@/components/customer/AppHeader";
import { ButcherArt } from "@/components/customer/ButcherArt";
import { BottomNav } from "@/components/customer/BottomNav";
import { CartBar } from "@/components/customer/CartBar";
import { CartSync } from "@/components/customer/CartSync";
import { Tracker } from "@/components/customer/Tracker";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    // no backgrounds here: the page's ground is the body's, so the art can sit behind everything
    <div className="min-h-dvh">
      <ButcherArt />
      {/* phones and tablets: one column; a wide screen gets the full width (pages lay themselves out from lg) */}
      <div className="relative mx-auto min-h-dvh max-w-[480px] text-center text-ivory lg:max-w-[1440px]">
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
