import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE_NAME = "school_profiler_admin";

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function expectedToken(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "change-me-in-production";
  const pin = process.env.ADMIN_PIN ?? "69760626";
  return digest(`${secret}:${pin}`);
}

export function isValidAdminPin(pin: string): boolean {
  const expected = process.env.ADMIN_PIN ?? "69760626";
  return pin.trim() === expected;
}

export function buildAdminCookieValue(): string {
  return expectedToken().toString("hex");
}

export function verifyAdminCookieValue(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const provided = Buffer.from(value, "hex");
    const expected = expectedToken();
    if (provided.length !== expected.length) return false;
    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}
