import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isAdminAuthorized())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await prisma.$transaction([
    prisma.answer.deleteMany(),
    prisma.specialistReview.deleteMany(),
    prisma.session.deleteMany(),
    prisma.accessCode.deleteMany(),
    prisma.child.deleteMany(),
    prisma.systemMeta.upsert({ where: { id: 1 }, update: { lastBackupAt: null }, create: { id: 1, lastBackupAt: null } }),
  ]);

  return NextResponse.json({ ok: true });
}
