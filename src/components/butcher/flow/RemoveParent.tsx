"use client";
// "🗑 מחק נתח" — at any step of the flow and on the cut in work at home (founders, 22.10.2026). remove_parent throws
// away a cut nothing of which went live; otherwise its drafts go, what is live comes off the showcase and it closes.
// RemoveItem is the same for one tray or the block (remove_item): a draft goes, a live one comes off the showcase.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { ConfirmDialog } from "../../ui";
import { IconTrash } from "../../icons";
import { useToast } from "../../Toast";
import { he } from "@/lib/i18n/he";
import { errorCode, errorText } from "@/lib/errors";
import { supabaseBrowser } from "@/lib/supabase/client";

export function RemoveParent({ parentId, code, onRemoved, className }: {
  parentId: string; code: number | null;
  /** after it is gone; by default back to the butcher's home */
  onRemoved?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setAsking(false);
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("remove_parent", { p_parent_id: parentId });
    setBusy(false);
    if (error) {
      return toast(errorCode(error) === "HAS_ACTIVE_ORDERS" ? he.flow.removeHasOrders : errorText(error), { tone: "error" });
    }
    toast(he.flow.removedCut, { tone: "success" });
    if (onRemoved) onRemoved(); else router.replace("/butcher");
  }

  return (
    <>
      <button type="button" aria-label={he.flow.removeCut} title={he.flow.removeCut} disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsking(true); }}
        className={clsx("grid size-12 shrink-0 place-items-center rounded-full bg-ink-2 text-sold shadow-[var(--shadow-card)]", className)}>
        <IconTrash />
      </button>
      <ConfirmDialog open={asking} text={he.flow.removeCutConfirm(code)} confirmLabel={he.flow.removeCut} danger
        onConfirm={remove} onCancel={() => setAsking(false)} />
    </>
  );
}

export function RemoveItem({ itemId, label, onRemoved, className }: {
  itemId: string; label: string | null; onRemoved: () => void; className?: string;
}) {
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setAsking(false);
    setBusy(true);
    const { error } = await supabaseBrowser().rpc("remove_item", { p_item_id: itemId });
    setBusy(false);
    if (error) {
      return toast(errorCode(error) === "HAS_ACTIVE_ORDERS" ? he.flow.removeItemHasOrders : errorText(error), { tone: "error" });
    }
    toast(he.flow.removedItem, { tone: "success" });
    onRemoved();
  }

  return (
    <>
      <button type="button" aria-label={he.flow.removeItem(label)} title={he.flow.removeItem(label)} disabled={busy}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAsking(true); }}
        className={clsx("grid size-12 shrink-0 place-items-center rounded-full bg-ink-2 text-sold shadow-[var(--shadow-card)]", className)}>
        <IconTrash />
      </button>
      <ConfirmDialog open={asking} text={he.flow.removeItemConfirm(label)} confirmLabel={he.flow.removeItem(label)} danger
        onConfirm={remove} onCancel={() => setAsking(false)} />
    </>
  );
}
