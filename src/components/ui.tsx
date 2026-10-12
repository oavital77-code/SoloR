"use client";
// Small RTL-friendly UI primitives (shadcn-inspired, Tailwind only).
import { clsx } from "clsx";
import { Loader2, Minus, Plus } from "lucide-react";
import { useEffect } from "react";
import { he } from "@/lib/i18n/he";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "dark";

export function Button({
  variant = "primary", size = "md", loading, className, children, disabled, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "md" | "lg" | "xl"; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex select-none items-center justify-center gap-2 rounded-2xl font-bold transition-[transform,background-color,opacity] duration-150 active:scale-[0.98] disabled:opacity-45 disabled:active:scale-100",
        size === "md" && "min-h-11 px-4 text-[15px]",
        size === "lg" && "min-h-14 px-5 text-lg",
        size === "xl" && "min-h-16 px-6 text-xl",
        variant === "primary" && "bg-brand text-white shadow-sm hover:bg-brand-dark",
        variant === "secondary" && "bg-neutral-100 text-neutral-900 ring-1 ring-neutral-300 hover:bg-neutral-200",
        variant === "ghost" && "text-current hover:bg-black/5",
        variant === "danger" && "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
        variant === "dark" && "bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/15",
        className,
      )}
    >
      {loading && <Loader2 className="size-5 animate-spin" />}
      {children}
    </button>
  );
}

export function Chip({
  selected, className, children, dark, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean; dark?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={clsx(
        "min-h-11 rounded-2xl px-4 text-[15px] font-semibold transition-colors duration-150 disabled:opacity-40",
        dark
          ? selected ? "bg-brand text-white" : "bg-white/10 text-white ring-1 ring-white/15"
          : selected ? "bg-brand text-white ring-2 ring-brand" : "bg-white text-neutral-900 ring-1 ring-neutral-300",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, dark, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; dark?: boolean; disabled?: boolean;
}) {
  return (
    <label className={clsx("flex min-h-11 cursor-pointer items-center justify-between gap-3", disabled && "opacity-50")}>
      <span className="font-semibold">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative h-8 w-14 shrink-0 rounded-full transition-colors duration-150",
          checked ? "bg-brand" : dark ? "bg-white/20" : "bg-neutral-300",
        )}
      >
        <span
          className={clsx(
            "absolute top-1 size-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-150",
            checked ? "start-7" : "start-1",
          )}
        />
      </button>
    </label>
  );
}

export function Stepper({ value, min, max, onChange, dark, size = "md", label }: {
  value: number; min: number; max: number; onChange: (v: number) => void; dark?: boolean; size?: "md" | "lg"; label?: string;
}) {
  const btn = clsx(
    "grid place-items-center rounded-2xl font-bold disabled:opacity-30",
    size === "lg" ? "size-14" : "size-11",
    dark ? "bg-white/10 text-white" : "bg-neutral-100 text-neutral-900 ring-1 ring-neutral-300",
  );
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="פחות" disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Minus className="size-5" />
      </button>
      <span className={clsx("ltr min-w-10 text-center font-extrabold tabular-nums", size === "lg" ? "text-3xl" : "text-2xl")} aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} aria-label="יותר" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Plus className="size-5" />
      </button>
    </div>
  );
}

export function BottomSheet({ open, onClose, title, children, dark }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode; dark?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        className={clsx(
          "animate-slide-up relative max-h-[90dvh] w-full max-w-[480px] overflow-y-auto rounded-t-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]",
          dark ? "bg-ink-2 text-white" : "bg-white text-neutral-900",
        )}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-current opacity-20" />
        {title && <h2 className="mb-4 text-xl font-extrabold">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, text, confirmLabel, onConfirm, onCancel, loading, danger }: {
  open: boolean; text: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; loading?: boolean; danger?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-6" role="alertdialog" aria-modal="true" aria-label={text}>
      <div className="animate-fade-in absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="animate-fade-in relative w-full max-w-sm rounded-3xl bg-white p-6 text-neutral-900 shadow-xl">
        <p className="mb-6 text-lg font-semibold leading-snug">{text}</p>
        <div className="flex gap-3">
          <Button size="lg" className="flex-1" variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
            {confirmLabel ?? he.app.confirm}
          </Button>
          <Button size="lg" className="flex-1" variant="secondary" onClick={onCancel} disabled={loading}>
            {he.app.cancel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("size-6 animate-spin", className)} aria-label={he.app.loading} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("animate-pulse rounded-2xl bg-current opacity-10", className)} />;
}

export function EmptyState({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <p className="text-lg leading-relaxed opacity-80">{text}</p>
      {children}
    </div>
  );
}

export function ErrorState({ text, onRetry, dark }: { text?: string; onRetry?: () => void; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-8 py-16 text-center" role="alert">
      <p className="text-lg opacity-80">{text ?? he.app.errorLoad}</p>
      {onRetry && <Button variant={dark ? "dark" : "secondary"} onClick={onRetry}>{he.app.retry}</Button>}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor, dark }: {
  label: string; hint?: string; error?: string | null; children: React.ReactNode; htmlFor?: string; dark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-[15px] font-bold">{label}</label>
      {children}
      {error ? <p className={clsx("text-sm font-semibold", dark ? "text-red-300" : "text-red-700")} role="alert">{error}</p>
        : hint ? <p className={clsx("text-sm", dark ? "text-white/50" : "text-neutral-500")}>{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "min-h-14 w-full rounded-2xl bg-white px-4 text-lg ring-1 ring-neutral-300 outline-none focus:ring-2 focus:ring-brand disabled:bg-neutral-100 disabled:text-neutral-500";
export const inputDarkClass =
  "min-h-12 w-full rounded-2xl bg-white/10 px-4 text-base text-white ring-1 ring-white/15 outline-none placeholder:text-white/40 focus:ring-2 focus:ring-brand";

/** Shows numbers/codes LTR inside Hebrew text */
export function Ltr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span dir="ltr" className={clsx("ltr", className)}>{children}</span>;
}
