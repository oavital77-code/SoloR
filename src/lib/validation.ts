// zod schemas — the same rules as the DB CHECK constraints (SPEC §6.1).
import { z } from "zod";
import { he } from "./i18n/he";

export const emailSchema = z.string().trim().toLowerCase().email(he.auth.invalidEmail);
export const otpSchema = z.string().trim().regex(/^\d{6,10}$/, he.auth.invalidCode);

/** "0501234567" / "050-123-4567" / "+972501234567" → "050-1234567" */
export function normalizePhone(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3)}` : input.trim();
}

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, he.onboarding.invalidName).max(80, he.onboarding.invalidName),
  phone: z.string().transform(normalizePhone).pipe(z.string().regex(/^05\d-\d{7}$/, he.onboarding.invalidPhone)),
});

export const MEDIA_LIMITS = {
  maxPhotos: 6,
  maxVideoSeconds: 90,
  maxVideoBytes: 200 * 1024 * 1024,
  imageMaxSide: 2000,
  thumbMaxSide: 640,
  imageQuality: 0.82,
};
