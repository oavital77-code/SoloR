"use client";
// T3 — the clip's number (BUTCHER_FLOW_v2 R1): the butcher takes a numbered clip from the drawer, puts it on the cut
// and types its number on the big pad. A number another active cut holds is refused, saying which (R2); a clip is
// free again once all of its cut was sold or withdrawn (Q1). The number shows big for a moment, then the details.
import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlowLoading, FlowScreen } from "@/components/butcher/flow/FlowScreen";
import { Keypad } from "@/components/butcher/flow/Keypad";
import { useParent } from "@/components/butcher/flow/useParent";
import { useToast } from "@/components/Toast";
import { he } from "@/lib/i18n/he";
import { timeAgo } from "@/lib/cut-helpers";
import { errorCode, errorText } from "@/lib/errors";
import { cutTypeLabel } from "@/lib/labels";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { CutType, Parent } from "@/lib/types";

export default function ClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, state, reload } = useParent(id);
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => { if (parent && value == null) setValue(parent.code != null ? String(parent.code) : ""); }, [parent, value]);
  useEffect(() => {
    if (shown == null) return;
    const t = window.setTimeout(() => router.replace(`/butcher/parent/${id}/details`), 1500);
    return () => window.clearTimeout(t);
  }, [shown, id, router]);

  async function confirm() {
    const n = Number(value);
    if (!n || n > 9999) return setNote(he.flow.clipInvalid);
    if (parent?.code === n) return setShown(n);
    setBusy(true);
    const { data, error } = await supabaseBrowser().rpc("set_parent_code", { p_parent_id: id, p_code: n });
    setBusy(false);
    if (error) {
      const code = errorCode(error);
      if (code === "CODE_IN_USE") {
        let what = "";
        try {
          const d = JSON.parse(error.details ?? "{}") as { cut_type?: CutType | null; created_at?: string };
          what = [cutTypeLabel(d.cut_type), d.created_at && timeAgo(d.created_at)].filter(Boolean).join(" · ");
        } catch { /* the number alone */ }
        return setNote(he.flow.clipInUse(n, what || he.flow.noTitle));
      }
      if (code === "CODE_LOCKED") return setNote(he.flow.clipLocked);
      if (code === "INVALID_CODE") return setNote(he.flow.clipInvalid);
      return toast(errorText(error), { tone: "error" });
    }
    setShown((data as Parent).code);
  }

  if (shown != null) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink text-center" role="status">
        <div className="flex flex-col gap-2">
          <span className="text-xl font-bold text-stone">{he.flow.cutNo("").trim()}</span>
          <span className="ltr font-[family-name:var(--font-plex-mono)] text-[120px] leading-none font-bold">{shown}</span>
        </div>
      </div>
    );
  }
  if (state !== "ok" || !parent || value == null) return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
  return (
    <FlowScreen parent={parent} title={he.flow.clipTitle} sub={he.flow.clipHint} back={`/butcher/parent/${id}/photos`}
      footer={<button type="button" className="sr-cbtn sr-cbtn--new" disabled={!value || busy} onClick={confirm}>{he.flow.clipConfirm}</button>}>
      <div className="grid place-items-center rounded-3xl bg-ink-2 py-6 shadow-[var(--shadow-card)]">
        <span className="ltr font-[family-name:var(--font-plex-mono)] text-[96px] leading-none font-bold" aria-live="polite">{value || "—"}</span>
      </div>
      {note && <p className="m-0 text-center text-[17px] font-bold text-sold" role="alert">{note}</p>}
      <Keypad value={value} max={4} maxValue={9999} onChange={(v) => { setNote(null); setValue(v); }} />
    </FlowScreen>
  );
}
