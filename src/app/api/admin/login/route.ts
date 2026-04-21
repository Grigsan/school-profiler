import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, buildAdminCookieValue, isValidAdminPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { pin?: string };
  if (!isValidAdminPin(body.pin ?? "")) {
    return NextResponse.json({ ok: false, error: "INVALID_PIN" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, buildAdminCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true });
}
