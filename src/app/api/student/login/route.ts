import { NextResponse } from "next/server";
import { findChildByCode } from "@/lib/dbStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: string };
  const code = (body.code ?? "").trim().toUpperCase();
  const access = await findChildByCode(code);
  if (!access) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (access.status === "Недействителен") return NextResponse.json({ error: "INVALID" }, { status: 403 });

  return NextResponse.json({
    child: {
      id: access.child.id,
      registryId: access.child.registryId,
      grade: access.child.grade === "G4" ? 4 : 6,
      classGroup: access.child.classGroup,
      accessCode: access.child.accessCode,
      isActive: access.child.isActive,
      notes: access.child.notes ?? undefined,
      createdAt: access.child.createdAt.toISOString(),
    },
    accessCode: {
      id: access.id,
      code: access.code,
      childId: access.childId,
      registryId: access.registryId,
      grade: access.grade === "G4" ? 4 : 6,
      classGroup: access.classGroup,
      status: access.status,
      createdAt: access.createdAt.toISOString(),
      updatedAt: access.updatedAt.toISOString(),
    },
  });
}
