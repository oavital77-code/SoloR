import { ButcherShell } from "@/components/butcher/ButcherShell";

export default function ButcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="counter" className="min-h-dvh bg-ink-3">
      <div className="mx-auto min-h-dvh max-w-[480px] bg-ink text-ivory shadow-sm lg:max-w-[1100px]">
        <ButcherShell>{children}</ButcherShell>
      </div>
    </div>
  );
}
