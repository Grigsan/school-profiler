import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifyAdminCookieValue } from "@/lib/auth";
import { readState, resetState, updateState } from "@/lib/serverState";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as { revision?: number; store?: unknown; lastBackupAt?: string | null };
  const result = await updateState({
    expectedRevision: typeof body.revision === "number" ? body.revision : -1,
    store: body.store,
    lastBackupAt: body.lastBackupAt,
  });

  if (!result.ok) {
    return NextResponse.json({ error: "REVISION_CONFLICT", ...result.state }, { status: 409 });
  }

  return NextResponse.json(result.state);
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!verifyAdminCookieValue(token)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const state = await resetState();
  return NextResponse.json(state);
}
