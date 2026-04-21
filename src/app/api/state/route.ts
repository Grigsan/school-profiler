import { NextResponse } from "next/server";
import { getDashboardStore } from "@/lib/dbStore";
import { isAdminAuthorized } from "@/lib/adminGuard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const [store, meta] = await Promise.all([getDashboardStore(), prisma.systemMeta.findUnique({ where: { id: 1 } })]);
  return NextResponse.json({ store, lastBackupAt: meta?.lastBackupAt?.toISOString() ?? null });
}

export async function PUT() {
  return NextResponse.json(
    { error: "DEPRECATED", message: "Глобальная запись состояния отключена. Используйте entity-scoped API." },
    { status: 410 },
  );
}

export async function DELETE() {
  if (!(await isAdminAuthorized())) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
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
