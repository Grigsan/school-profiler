import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/adminGuard";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await isAdminAuthorized())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json()) as { startedAt: string; scores: unknown[]; recommendation: string };

  await prisma.$transaction([
    prisma.answer.deleteMany({ where: { sessionId } }),
    prisma.specialistReview.deleteMany({ where: { sessionId } }),
    prisma.session.update({
      where: { id: sessionId },
      data: {
        status: "paused",
        startedAt: new Date(body.startedAt),
        pausedAt: new Date(body.startedAt),
        completedAt: null,
        currentQuestionIndex: 0,
        scores: body.scores,
        pauseEvents: [],
        quality: null,
        recommendation: body.recommendation,
        adminState: "reset",
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
