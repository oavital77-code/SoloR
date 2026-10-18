// 4-step order timeline with real timestamps from order_events (never shows a step that didn't happen).
// The butcher's (light): numbered steps on a hairline. The customer's (dark, design: Tracking): dots on a rail —
// gold when done, a ringed dot now, muted ahead — with whatever belongs to the current step under it.
import { clsx } from "clsx";
import { orderStatusShort } from "@/lib/labels";
import { formatDateTime } from "@/lib/cut-helpers";
import type { OrderEvent, OrderStatus, ReceiveMethod } from "@/lib/types";

const STEPS: OrderStatus[] = ["new", "preparing", "ready", "completed"];

export function OrderTimeline({ status, events, dark, method, now }: {
  status: OrderStatus; events: OrderEvent[]; dark?: boolean; method?: ReceiveMethod; now?: React.ReactNode;
}) {
  const at = (s: OrderStatus) => events.find((e) => e.to_status === s)?.created_at;
  const cancelledAt = at("cancelled");
  const reached = STEPS.filter((s) => at(s));
  const steps: OrderStatus[] = status === "cancelled" ? [...reached, "cancelled"] : STEPS;

  if (dark) {
    return (
      <ol className="sr-timeline m-0 list-none p-0">
        {steps.map((s, i) => {
          const time = s === "cancelled" ? cancelledAt : at(s);
          const current = s === status && s !== "completed" && s !== "cancelled";
          const state = current ? "now" : time ? "done" : "todo";
          const last = i === steps.length - 1;
          return (
            <li key={s} className={`sr-step sr-step--${state}`}>
              <div className="sr-step__rail"><span className="sr-step__dot" />{!last && <span className="sr-step__line" />}</div>
              <div className={clsx("flex flex-col gap-2.5", !last && "pb-3")}>
                <div>
                  <div className="sr-step__label">{orderStatusShort(s, method)}</div>
                  {time && <div className="sr-step__time">{formatDateTime(time)}</div>}
                </div>
                {current && now}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const time = s === "cancelled" ? cancelledAt : at(s);
        const done = !!time;
        const current = s === status;
        const last = i === steps.length - 1;
        const dot = clsx(
          "grid size-8 place-items-center rounded-full font-display text-sm font-bold",
          s === "cancelled" ? (dark ? "text-stone ring-1 ring-stone/50" : "text-stone ring-1 ring-neutral-400")
            : current ? (dark ? "bg-ivory text-ink" : "bg-ink text-white")
            : done ? (dark ? "text-gold ring-1 ring-gold/70" : "text-ink ring-1 ring-ink/60")
            : dark ? "text-ivory/35 ring-1 ring-ivory/15" : "text-stone ring-1 ring-line",
        );
        const line = clsx("w-px", done ? (dark ? "bg-gold/60" : "bg-ink/50") : dark ? "bg-ivory/10" : "bg-ink-3");
        const text = (
          <div className={clsx(!done && "opacity-50")}>
            <p className={clsx("font-semibold", current && "font-display text-lg font-bold")}>{orderStatusShort(s, method)}</p>
            {time && <p className={clsx("text-sm", dark ? "text-stone" : "text-stone")}>{formatDateTime(time)}</p>}
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
