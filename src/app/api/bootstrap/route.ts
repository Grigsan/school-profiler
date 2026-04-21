import { NextResponse } from "next/server";
import { getDashboardStore } from "@/lib/dbStore";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getDashboardStore();
  return NextResponse.json({ store });
}
