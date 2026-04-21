import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.session.findUnique({ where: { id }, include: { answers: true, specialistReview: true } });
  if (!session) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({
    session: {
      ...session,
      grade: session.grade === "G4" ? 4 : 6,
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      scores: session.scores,
      pauseEvents: session.pauseEvents,
      quality: session.quality,
      adminOverride: session.adminOverride,
      answers: session.answers.map((a) => ({ ...a, answeredAt: a.answeredAt.toISOString() })),
      specialistFinalDecision: session.specialistReview?.finalDecision,
      reviewStatus: session.specialistReview?.reviewStatus,
      specialistComment: session.specialistReview?.comment,
    },
  });
}
