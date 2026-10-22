// The label on an item (BUTCHER_FLOW_v2): "09" (the block) / "09-01" (a tray), as the butcher types it ("9-1" too),
// also "SOL-09-01".
// Scanning (scale labels, QR) is left out for now — founders' decision 22.10.2026: everything is typed by hand.

export interface SolorLabel { label: string; parentCode: number; unitNo: number | null }

/** "SOL-09-01", "9-1", "9" (also inside a link) → the item it names; written with two digits ("09-01", "09") */
export function readSolorLabel(text: string): SolorLabel | null {
  const m = text.trim().toUpperCase().match(/(?:^|SOL-)(\d{1,7})(?:-(\d{1,4}))?(?![\d-])/);
  if (!m) return null;
  const parentCode = Number(m[1]);
  const unitNo = m[2] ? Number(m[2]) : null;
  return { label: `${String(parentCode).padStart(2, "0")}${unitNo ? `-${String(unitNo).padStart(2, "0")}` : ""}`, parentCode, unitNo };
}
