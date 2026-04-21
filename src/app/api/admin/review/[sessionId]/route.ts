import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminAuthorized())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json()) as { specialistFinalDecision?: string; reviewStatus?: string; specialistComment?: string; adminOverride?: { text: string; by: string; at: string } };

  await prisma.$transaction(async (tx: typeof prisma) => {
    if (body.adminOverride) {
      await tx.session.update({ where: { id: sessionId }, data: { adminOverride: body.adminOverride } });
    }
    await tx.specialistReview.upsert({
      where: { sessionId },
      update: {
        finalDecision: body.specialistFinalDecision,
        reviewStatus: body.reviewStatus,
        comment: body.specialistComment,
      },
      create: {
        id: crypto.randomUUID(),
        sessionId,
        finalDecision: body.specialistFinalDecision,
        reviewStatus: body.reviewStatus,
        comment: body.specialistComment,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
