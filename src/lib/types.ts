// Hand-written DB types (mirror of supabase/migrations). Replace with `supabase gen types` when convenient.

export type UserRole = "customer" | "butcher";
export type CutType = "sinta" | "entrecote" | "ontrib" | "asado" | "picanha" | "shaitel" | "denver";
export type OriginCountry = "IL" | "AR" | "UY" | "PY" | "JP" | "AU";
export type AgingMethod = "dry" | "wet";
export type SaleMode = "whole" | "steaks" | "both";
export type CutStatus = "draft" | "published" | "sold_out" | "withdrawn";
export type MediaType = "photo" | "video";
export type OrderMode = "whole" | "steaks";
export type OrderStatus = "new" | "preparing" | "ready" | "completed" | "cancelled";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  phone: string;
  butcher_id: string | null;
  created_at: string;
}

export interface Butcher {
  id: string;
  name: string;
  address: string;
  phone: string;
  pickup_hours: string | null;
  logo_path: string | null;
  slug: string;
  city: string | null;
  description: string | null;
  is_test: boolean;
  // shop page (customer spec §7.1); unfilled fields are not shown
  cover_path: string | null;
  specialty: string | null;
  opening_hours: import("./hours").OpeningHours | null;
  suppliers: string[];
  sources: string[];
  pickup_enabled: boolean;
  delivery_enabled: boolean;
  delivery_areas: string[];
  /** {"<area>": fee in agorot, "*": any other listed area}; a missing fee is 0 */
  delivery_pricing: Record<string, number>;
  /** time windows the shop offers for delivery; none = waiting for the shop to coordinate */
  delivery_windows: string[];
  status: "active" | "inactive";
}

export interface Breed {
  key: string;
  label_he: string;
  applies_to: CutType[];
  sort_order: number;
  active: boolean;
}

export interface Cut {
  id: string;
  code: string;
  butcher_id: string;
  status: CutStatus;
  cut_type: CutType | null;
  breed_key: string | null;
  breed_other: string | null;
  origin_country: OriginCountry | null;
  is_aged: boolean | null;
  aging_days: number | null;
  aging_method: AgingMethod | null;
  butcher_marbling: number | null;
  description: string | null;
  weight_g: number | null;
  price_per_kg_agorot: number | null;
  sale_mode: SaleMode | null;
  steak_weight_g: number | null;
  steak_thickness_cm: number | null;
  steaks_planned: number | null;
  steaks_total: number;
  steaks_available: number;
  whole_available: boolean;
  published_at: string | null;
  sold_out_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CutMedia {
  id: string;
  cut_id: string;
  type: MediaType;
  storage_path: string;
  thumb_path: string | null;
  poster_path: string | null;
  is_cover: boolean;
  sort_order: number;
  width: number | null;
  height: number | null;
  duration_s: number | null;
  created_at: string;
}

export interface CutWithMedia extends Cut {
  cut_media: CutMedia[];
}

/** One purchase by a customer: one (simulated) payment for the whole cart. */
export interface Checkout {
  id: string;
  checkout_number: number;
  idempotency_key: string;
  customer_id: string;
  total_agorot: number;
  payment_status: string;
  contact_name: string | null;
  contact_phone: string | null;
  /** prototype: no payment was taken */
  is_demo: boolean;
  created_at: string;
}

export type ReceiveMethod = "pickup" | "delivery";

/** Where a delivery goes — may be someone else (a friend, family). */
export interface DeliveryAddress {
  name: string;
  phone: string;
  street: string;
  city: string;
  notes?: string | null;
}

/** How one shop's part is received, as checked by the server. */
export interface ReceiveChoice {
  method: ReceiveMethod;
  address: DeliveryAddress | null;
  /** null with delivery = waiting for the shop to coordinate */
  window: string | null;
  fee_agorot: number;
}

/** A checkout attempt holding the cart until expires_at (customer spec §10.4). */
export interface Hold {
  id: string;
  idempotency_key: string;
  customer_id: string;
  receive: Record<string, ReceiveChoice>;
  contact: { name: string; phone: string };
  items_agorot: number;
  fees_agorot: number;
  total_agorot: number;
  status: "active" | "released" | "consumed";
  expires_at: string;
  checkout_id: string | null;
  created_at: string;
}

/** One shop's part of a checkout — what the butcher picks and packs as a single order. */
export interface Order {
  id: string;
  order_number: number;
  checkout_id: string;
  customer_id: string;
  butcher_id: string;
  /** sum of the active lines (kept as the last value when the whole order is cancelled) */
  total_agorot: number;
  status: OrderStatus;
  payment_status: string;
  customer_note: string | null;
  cancel_reason: string | null;
  cancelled_by: UserRole | null;
  receive_method: ReceiveMethod;
  delivery_address: DeliveryAddress | null;
  delivery_window: string | null;
  delivery_fee_agorot: number;
  created_at: string;
  updated_at: string;
}

export type OrderItemStatus = "active" | "cancelled";

/** A cut line inside an order. */
export interface OrderItem {
  id: string;
  order_id: string;
  cut_id: string;
  mode: OrderMode;
  steaks_qty: number | null;
  est_weight_g: number;
  price_per_kg_agorot: number;
  total_agorot: number;
  status: OrderItemStatus;
  cancel_reason: string | null;
  cancelled_by: UserRole | null;
  cancelled_at: string | null;
  restocked: boolean | null;
  created_at: string;
}

export interface OrderEvent {
  id: number;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

/** Content columns the butcher may write directly (everything else goes through RPCs). */
export const CUT_CONTENT_FIELDS = [
  "cut_type", "breed_key", "breed_other", "origin_country", "is_aged", "aging_days", "aging_method",
  "butcher_marbling", "description", "weight_g", "price_per_kg_agorot", "sale_mode",
  "steak_weight_g", "steak_thickness_cm", "steaks_planned",
] as const;
export type CutContentField = (typeof CUT_CONTENT_FIELDS)[number];
export type CutContent = Pick<Cut, CutContentField>;

/** Fields that stay editable on a live cut even with active orders (SPEC §6.5). */
export const ALWAYS_EDITABLE: CutContentField[] = ["description", "butcher_marbling"];
