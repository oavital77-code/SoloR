// The label on an item (BUTCHER_FLOW chapter 8): "SOL-523" / "SOL-523-1", or just "523-1" as the butcher types it.
// Scanning (scale labels, QR) is left out for now — founders' decision 22.10.2026: everything is typed by hand.

export interface SolorLabel { label: string; parentCode: number; unitNo: number | null }

/** "SOL-523-2", "523-2", "523" (also inside a link) → the item it names */
export function readSolorLabel(text: string): SolorLabel | null {
  const m = text.trim().toUpperCase().match(/(?:^|SOL-)(\d{1,7})(?:-(\d{1,4}))?(?![\d-])/);
  if (!m) return null;
  const parentCode = Number(m[1]);
  const unitNo = m[2] ? Number(m[2]) : null;
  return { label: unitNo ? `${parentCode}-${unitNo}` : String(parentCode), parentCode, unitNo };
}
