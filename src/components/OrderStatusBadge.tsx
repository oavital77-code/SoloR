import { clsx } from "clsx";
import { orderStatusShort } from "@/lib/labels";
import type { OrderStatus, ReceiveMethod } from "@/lib/types";

// Customer (dark): a quiet outlined label. Butcher (light): solid colours, scanned at a glance at the counter.
export function OrderStatusBadge({ status, dark, method }: { status: OrderStatus; dark?: boolean; method?: ReceiveMethod }) {
  if (dark) {
    return (
      <span className={clsx(
        "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] tracking-wider ring-1",
        status === "ready" ? "bg-ivory text-ink ring-ivory"
          : status === "new" || status === "preparing" ? "text-gold ring-gold/50"
          : status === "cancelled" ? "text-stone ring-stone/30 line-through"
          : "text-ivory/70 ring-ivory/20",
      )}>
        {orderStatusShort(status, method)}
      </span>
    );
  }
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
        status === "new" && "bg-brand text-white",
        status === "preparing" && "bg-amber-400 text-amber-950",
        status === "ready" && "bg-emerald-500 text-white",
        status === "completed" && "bg-neutral-200 text-neutral-700",
        status === "cancelled" && "bg-neutral-100 text-neutral-500 line-through",
      )}
    >
      {orderStatusShort(status, method)}
    </span>
  );
}
