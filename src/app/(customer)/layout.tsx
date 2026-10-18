import { Suspense } from "react";
import { AppHeader } from "@/components/customer/AppHeader";
import { BottomNav } from "@/components/customer/BottomNav";
import { CartBar } from "@/components/customer/CartBar";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-black">
      <div className="relative mx-auto min-h-dvh max-w-[480px] bg-ink text-center text-white">
        <AppHeader />
        {children}
        <CartBar />
        <Suspense><BottomNav /></Suspense>
      </div>
    </div>
  );
}
