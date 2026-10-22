"use client";
// /butcher/parent/[id] — goes to the step the parent is at (BUTCHER_FLOW_v2 §3).
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FlowLoading, parentStep } from "@/components/butcher/flow/FlowScreen";
import { useParent } from "@/components/butcher/flow/useParent";

export default function ParentRouter({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { parent, state, reload } = useParent(id);
  const router = useRouter();
  useEffect(() => { if (parent) router.replace(parentStep(parent)); }, [parent, router]);
  return <FlowLoading state={state === "ok" ? "loading" : state} onRetry={reload} />;
}
