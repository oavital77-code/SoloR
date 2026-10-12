import { ButcherShell } from "@/components/butcher/ButcherShell";

export default function ButcherLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-100">
      <div className="mx-auto min-h-dvh max-w-[480px] bg-neutral-50 text-neutral-900 shadow-sm">
        <ButcherShell>{children}</ButcherShell>
      </div>
    </div>
  );
}
