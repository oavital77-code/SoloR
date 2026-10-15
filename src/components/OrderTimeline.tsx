// 4-step order timeline with real timestamps from order_events (never shows a step that didn't happen).
// Numbered steps on a hairline — no icons.
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
        const dot = clsx(
          "grid size-8 place-items-center rounded-full font-display text-sm font-bold",
          s === "cancelled" ? (dark ? "text-stone ring-1 ring-stone/50" : "text-neutral-500 ring-1 ring-neutral-400")
            : current ? (dark ? "bg-ivory text-ink" : "bg-ink text-white")
            : done ? (dark ? "text-gold ring-1 ring-gold/70" : "text-ink ring-1 ring-ink/60")
            : dark ? "text-ivory/35 ring-1 ring-ivory/15" : "text-neutral-400 ring-1 ring-neutral-300",
        );
        const line = clsx("w-px", done ? (dark ? "bg-gold/60" : "bg-ink/50") : dark ? "bg-ivory/10" : "bg-neutral-200");
        const text = (
          <div className={clsx(!done && "opacity-50")}>
            <p className={clsx("font-semibold", current && "font-display text-lg font-bold")}>{ORDER_STATUS_SHORT[s]}</p>
            {time && <p className={clsx("text-sm", dark ? "text-stone" : "text-neutral-500")}>{formatDateTime(time)}</p>}
          </div>
        );
        // customer (dark): centred column — number, label, time, then a short hairline to the next step
        if (dark) {
          return (
            <li key={s} className="flex flex-col items-center gap-1.5 text-center">
              <span className={dot}>{i + 1}</span>
              {text}
              {!last && <span className={clsx(line, "mt-1 h-5")} />}
            </li>
          );
        }
        return (
          <li key={s} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={dot}>{i + 1}</span>
              {!last && <span className={clsx(line, "min-h-6 flex-1")} />}
            </div>
            <div className="pb-5">{text}</div>
          </li>
        );
      })}
    </ol>
  );
}
