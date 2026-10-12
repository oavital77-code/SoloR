"use client";
import { Suspense, use } from "react";
import { CutWizard } from "@/components/butcher/CutWizard";

export default function EditCutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><CutWizard cutId={id} /></Suspense>;
}
