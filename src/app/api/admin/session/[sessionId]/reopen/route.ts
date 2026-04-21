import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminAuthorized())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json()) as { pausedAt: string; currentQuestionIndex: number; scores: unknown[]; recommendation: string; answers: Array<{ questionId: string }> };

  const keep = new Set(body.answers.map((x) => x.questionId));
  await prisma.$transaction(async (tx: typeof prisma) => {
    const existing = await tx.answer.findMany({ where: { sessionId } });
    const toDelete = existing.filter((a: any) => !keep.has(a.questionId)).map((a: any) => a.id);
    if (toDelete.length) await tx.answer.deleteMany({ where: { id: { in: toDelete } } });
    await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "paused",
        pausedAt: new Date(body.pausedAt),
        completedAt: null,
        currentQuestionIndex: body.currentQuestionIndex,
        scores: body.scores,
        quality: null,
        recommendation: body.recommendation,
        adminState: "reopened",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
