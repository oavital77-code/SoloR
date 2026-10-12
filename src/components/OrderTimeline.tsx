// 4-step order timeline with real timestamps from order_events (never shows a step that didn't happen).
import { Check, X } from "lucide-react";
import { clsx } from "clsx";
import { ORDER_STATUS_SHORT } from "@/lib/labels";
import { formatDateTime } from "@/lib/cut-helpers";
import type { OrderEvent, OrderStatus } from "@/lib/types";

const STEPS: OrderStatus[] = ["new", "preparing", "ready", "completed"];

export function OrderTimeline({ status, events, dark }: { status: OrderStatus; events: OrderEvent[]; dark?: boolean }) {
  const at = (s: OrderStatus) => events.find((e) => e.to_status === s)?.created_at;
  const cancelledAt = at("cancelled");
  const reached = STEPS.filter((s) => at(s));
  const steps: OrderStatus[] = status === "cancelled" ? [...reached, "cancelled"] : STEPS;

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const time = s === "cancelled" ? cancelledAt : at(s);
        const done = !!time;
        const current = s === status;
        const last = i === steps.length - 1;
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={clsx(
                  "grid size-8 place-items-center rounded-full text-sm font-bold",
                  s === "cancelled" ? "bg-neutral-500 text-white"
                    : done ? (current ? "bg-brand text-white" : "bg-emerald-600 text-white")
                    : dark ? "bg-white/10 text-white/40" : "bg-neutral-200 text-neutral-400",
                )}
              >
                {s === "cancelled" ? <X className="size-4" /> : done ? <Check className="size-4" /> : i + 1}
              </span>
              {!last && <span className={clsx("w-0.5 flex-1 min-h-6", done ? "bg-emerald-600" : dark ? "bg-white/10" : "bg-neutral-200")} />}
            </div>
            <div className={clsx("pb-5", !done && "opacity-50")}>
              <p className={clsx("font-bold", current && "text-lg")}>{ORDER_STATUS_SHORT[s]}</p>
              {time && <p className={clsx("text-sm", dark ? "text-white/60" : "text-neutral-500")}>{formatDateTime(time)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
