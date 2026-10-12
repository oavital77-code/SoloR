// enum → Hebrew labels
import type { AgingMethod, CutStatus, CutType, OrderStatus, OriginCountry, SaleMode } from "./types";

export const CUT_TYPES: { key: CutType; label: string }[] = [
  { key: "sinta", label: "סינטה" },
  { key: "entrecote", label: "אנטריקוט" },
  { key: "ontrib", label: "אונטריב" },
  { key: "asado", label: "אסאדו" },
  { key: "picanha", label: "פיקניה" },
  { key: "shaitel", label: "שייטל" },
  { key: "denver", label: "דנוור" },
];

export const ORIGINS: { key: OriginCountry; label: string; flag: string }[] = [
  { key: "IL", label: "ישראל", flag: "🇮🇱" },
  { key: "AR", label: "ארגנטינה", flag: "🇦🇷" },
  { key: "UY", label: "אורוגוואי", flag: "🇺🇾" },
  { key: "PY", label: "פרגוואי", flag: "🇵🇾" },
  { key: "JP", label: "יפן", flag: "🇯🇵" },
  { key: "AU", label: "אוסטרליה", flag: "🇦🇺" },
];

export const AGING_METHODS: { key: AgingMethod; label: string }[] = [
  { key: "dry", label: "יבש" },
  { key: "wet", label: "רטוב" },
];

export const SALE_MODES: { key: SaleMode; label: string }[] = [
  { key: "whole", label: "נתח שלם" },
  { key: "steaks", label: "סטייקים" },
  { key: "both", label: "גם וגם" },
];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "ההזמנה התקבלה",
  preparing: "הקצב מכין את ההזמנה",
  ready: "מוכנה לאיסוף",
  completed: "נאספה",
  cancelled: "בוטלה",
};

/** short labels for the timeline / badges */
export const ORDER_STATUS_SHORT: Record<OrderStatus, string> = {
  new: "התקבלה",
  preparing: "בהכנה",
  ready: "מוכנה לאיסוף",
  completed: "נאספה",
  cancelled: "בוטלה",
};

export const CUT_STATUS_LABEL: Record<CutStatus, string> = {
  draft: "טיוטה",
  published: "באוויר",
  sold_out: "אזל",
  withdrawn: "הוסר",
};

export const cutTypeLabel = (k: CutType | null | undefined) => CUT_TYPES.find((c) => c.key === k)?.label ?? "";
export const originLabel = (k: OriginCountry | null | undefined) => ORIGINS.find((c) => c.key === k)?.label ?? "";
export const originFlag = (k: OriginCountry | null | undefined) => ORIGINS.find((c) => c.key === k)?.flag ?? "";
export const agingMethodLabel = (k: AgingMethod | null | undefined) =>
  AGING_METHODS.find((c) => c.key === k)?.label ?? null;
