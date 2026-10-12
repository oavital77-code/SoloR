import { describe, expect, it } from "vitest";
import { normalizePhone, profileSchema } from "./validation";

describe("phone validation", () => {
  it("normalizes Israeli mobile numbers", () => {
    expect(normalizePhone("0501234567")).toBe("050-1234567");
    expect(normalizePhone("050-123-4567")).toBe("050-1234567");
    expect(normalizePhone("+972 50 123 4567")).toBe("050-1234567");
  });
  it("accepts valid and rejects invalid", () => {
    expect(profileSchema.safeParse({ full_name: "דנה כהן", phone: "052-7654321" }).success).toBe(true);
    expect(profileSchema.safeParse({ full_name: "דנה כהן", phone: "03-1234567" }).success).toBe(false);
    expect(profileSchema.safeParse({ full_name: "ד", phone: "052-7654321" }).success).toBe(false);
  });
});
