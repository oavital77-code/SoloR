import { clsx } from "clsx";
import { orderStatusShort } from "@/lib/labels";
import type { OrderStatus, ReceiveMethod } from "@/lib/types";

// Customer (dark): a quiet outlined label. Butcher (light): the counter's status chips, scanned at a glance.
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
  // the counter (design: Counter): bordeaux fill for new, amber and green outlines for preparing and ready
  const tone = { new: "new", preparing: "prep", ready: "ready", completed: "done", cancelled: "cancelled" }[status];
  return <span className={`sr-status sr-status--${tone} shrink-0`}>{orderStatusShort(status, method)}</span>;
}
