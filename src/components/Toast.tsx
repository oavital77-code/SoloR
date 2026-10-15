"use client";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { he } from "@/lib/i18n/he";

interface ToastItem {
  id: number;
  text: string;
  tone: "info" | "success" | "error" | "live";
  action?: { label: string; onClick: () => void };
  duration: number;
}
type ShowToast = (text: string, opts?: Partial<Omit<ToastItem, "id" | "text">>) => void;

const ToastContext = createContext<ShowToast>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);

  const show = useCallback<ShowToast>((text, opts) => {
    const id = nextId.current++;
    const item: ToastItem = { id, text, tone: opts?.tone ?? "info", action: opts?.action, duration: opts?.duration ?? 4000 };
    setItems((xs) => [...xs.slice(-2), item]);
    window.setTimeout(() => dismiss(id), item.duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] mx-auto flex max-w-[480px] flex-col gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-toast-in pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-semibold shadow-lg ${
              t.tone === "error" ? "bg-red-700 text-white"
              : t.tone === "success" ? "bg-emerald-600 text-white"
              : t.tone === "live" ? "bg-ivory text-ink"
              : "bg-ink-2 text-ivory ring-1 ring-ivory/10"
            }`}
          >
            <span className="flex-1">{t.text}</span>
            {t.action && (
              <button
                className="min-h-11 rounded-xl bg-brand px-4 font-bold text-white"
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label={he.app.close} className="min-h-11 px-1 text-sm opacity-60" onClick={() => dismiss(t.id)}>
              {he.app.close}
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
