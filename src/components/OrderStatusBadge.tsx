import { clsx } from "clsx";
import { ORDER_STATUS_SHORT } from "@/lib/labels";
import type { OrderStatus } from "@/lib/types";

export function OrderStatusBadge({ status, dark }: { status: OrderStatus; dark?: boolean }) {
  return (
    <span
      className={clsx(
        "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold",
        status === "new" && "bg-brand text-white",
        status === "preparing" && "bg-amber-400 text-amber-950",
        status === "ready" && "bg-emerald-500 text-white",
        status === "completed" && (dark ? "bg-white/15 text-white/80" : "bg-neutral-200 text-neutral-700"),
        status === "cancelled" && (dark ? "bg-white/10 text-white/50 line-through" : "bg-neutral-100 text-neutral-500 line-through"),
      )}
    >
      {ORDER_STATUS_SHORT[status]}
    </span>
  );
}
