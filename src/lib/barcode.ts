// The label on an item (BUTCHER_FLOW_v2): "15" (the block) / "15-09" (a tray), as the butcher types it, also "SOL-15-09".
// Scanning (scale labels, QR) is left out for now — founders' decision 22.10.2026: everything is typed by hand.

export interface SolorLabel { label: string; parentCode: number; unitNo: number | null }

/** "SOL-15-09", "15-9", "15" (also inside a link) → the item it names; trays are two digits ("15-09") */
export function readSolorLabel(text: string): SolorLabel | null {
  const m = text.trim().toUpperCase().match(/(?:^|SOL-)(\d{1,7})(?:-(\d{1,4}))?(?![\d-])/);
  if (!m) return null;
  const parentCode = Number(m[1]);
  const unitNo = m[2] ? Number(m[2]) : null;
  return { label: unitNo ? `${parentCode}-${String(unitNo).padStart(2, "0")}` : String(parentCode), parentCode, unitNo };
}
