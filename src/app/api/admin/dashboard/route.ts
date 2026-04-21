import { NextResponse } from "next/server";
import { getDashboardStore } from "@/lib/dbStore";
import { isAdminAuthorized } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const store = await getDashboardStore();
  return NextResponse.json({ store });
}
