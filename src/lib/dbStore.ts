import { FIXED_CAMPAIGNS } from "./store";
import { prisma } from "./prisma";

function toGrade(grade: "G4" | "G6"): 4 | 6 {
  return grade === "G4" ? 4 : 6;
}

function fromGrade(grade: 4 | 6): "G4" | "G6" {
  return grade === 4 ? "G4" : "G6";
}

export async function getDashboardStore() {
  const [children, accessCodes, sessions] = await Promise.all([
    prisma.child.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.accessCode.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.session.findMany({
      orderBy: { startedAt: "desc" },
      include: { answers: true, specialistReview: true },
    }),
  ]);

  return {
    children: children.map((child: any) => ({ ...child, grade: toGrade(child.grade), createdAt: child.createdAt.toISOString(), updatedAt: undefined })),
    accessCodes: accessCodes.map((row: any) => ({
      ...row,
      grade: toGrade(row.grade),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    campaigns: FIXED_CAMPAIGNS,
    sessions: sessions.map((session: any) => ({
      id: session.id,
      childId: session.childId,
      campaignId: session.campaignId,
      grade: toGrade(session.grade),
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      scores: (session.scores as unknown[]) ?? [],
      answers: session.answers
        .sort((a: any, b: any) => a.answeredAt.getTime() - b.answeredAt.getTime())
        .map((a: any) => ({ ...a, answeredAt: a.answeredAt.toISOString() })),
      pauseEvents: (session.pauseEvents as unknown[]) ?? [],
      quality: (session.quality as object | null) ?? undefined,
      currentQuestionIndex: session.currentQuestionIndex,
      recommendation: session.recommendation,
      adminOverride: (session.adminOverride as object | null) ?? undefined,
      adminState: session.adminState ?? undefined,
      specialistFinalDecision: session.specialistReview?.finalDecision ?? undefined,
      specialistComment: session.specialistReview?.comment ?? undefined,
      reviewStatus: session.specialistReview?.reviewStatus ?? undefined,
    })),
  };
}

export async function findChildByCode(code: string) {
  const accessCode = await prisma.accessCode.findUnique({ where: { code }, include: { child: true } });
  return accessCode;
}

export async function startOrResumeSession(childId: string, grade: 4 | 6, campaignId: string, create: { id: string; recommendation: string; startedAt: string; scores: unknown[] }) {
  const dbGrade = fromGrade(grade);
  return prisma.$transaction(async (tx: typeof prisma) => {
    const completed = await tx.session.findFirst({
      where: { childId, campaignId, grade: dbGrade, status: "completed" },
    });
    if (completed) return { type: "completed" as const };

    const resumable = await tx.session.findFirst({
      where: { childId, campaignId, grade: dbGrade, status: { in: ["active", "paused"] } },
      orderBy: { startedAt: "desc" },
    });

    if (resumable) {
      const updated = await tx.session.update({
        where: { id: resumable.id },
        data: { status: "active", pausedAt: null },
      });
      return { type: "resumed" as const, sessionId: updated.id };
    }

    try {
      const created = await tx.session.create({
        data: {
          id: create.id,
          childId,
          campaignId,
          grade: dbGrade,
          status: "active",
          startedAt: new Date(create.startedAt),
          currentQuestionIndex: 0,
          recommendation: create.recommendation,
          scores: create.scores,
          pauseEvents: [],
        },
      });
      return { type: "created" as const, sessionId: created.id };
    } catch {
      const concurrent = await tx.session.findFirst({
        where: { childId, campaignId, grade: dbGrade, status: { in: ["active", "paused"] } },
        orderBy: { startedAt: "desc" },
      });
      if (concurrent) {
        const updated = await tx.session.update({
          where: { id: concurrent.id },
          data: { status: "active", pausedAt: null },
        });
        return { type: "resumed" as const, sessionId: updated.id };
      }
      throw new Error("Failed to start session atomically.");
    }
  });
}

export { fromGrade };
