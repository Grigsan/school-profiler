import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as {
    questionId: string;
    batteryId: string;
    choiceIndex: number;
    isCorrect: boolean;
    answeredAt: string;
    currentQuestionIndex: number;
    scores: unknown[];
    recommendation: string;
    pauseEvents: unknown[];
  };

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.answer.upsert({
      where: { sessionId_questionId: { sessionId: id, questionId: body.questionId } },
      update: {
        choiceIndex: body.choiceIndex,
        isCorrect: body.isCorrect,
        answeredAt: new Date(body.answeredAt),
      },
      create: {
        id: crypto.randomUUID(),
        sessionId: id,
        questionId: body.questionId,
        batteryId: body.batteryId,
        choiceIndex: body.choiceIndex,
        isCorrect: body.isCorrect,
        answeredAt: new Date(body.answeredAt),
      },
    });
    await tx.session.update({
      where: { id },
      data: {
        status: "active",
        pausedAt: null,
        currentQuestionIndex: body.currentQuestionIndex,
        scores: body.scores,
        recommendation: body.recommendation,
        pauseEvents: body.pauseEvents,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
