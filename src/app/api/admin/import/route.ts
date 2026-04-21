import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthorized } from "@/lib/adminGuard";
import { fromGrade } from "@/lib/dbStore";

export const dynamic = "force-dynamic";

type ImportStore = {
  children: Array<Record<string, any>>;
  accessCodes: Array<Record<string, any>>;
  sessions: Array<Record<string, any>>;
};

export async function POST(request: Request) {
  if (!(await isAdminAuthorized())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = (await request.json()) as { store: ImportStore; lastBackupAt?: string | null };

  await prisma.$transaction(async (tx: typeof prisma) => {
    await tx.answer.deleteMany();
    await tx.specialistReview.deleteMany();
    await tx.session.deleteMany();
    await tx.accessCode.deleteMany();
    await tx.child.deleteMany();

    if (body.store.children.length) {
      await tx.child.createMany({
        data: body.store.children.map((child) => ({
          id: child.id,
          registryId: child.registryId,
          grade: fromGrade(child.grade as 4 | 6),
          classGroup: child.classGroup,
          accessCode: child.accessCode,
          isActive: child.isActive,
          notes: child.notes,
          createdAt: new Date(child.createdAt),
        })),
      });
    }

    if (body.store.accessCodes.length) {
      await tx.accessCode.createMany({
        data: body.store.accessCodes.map((code) => ({
          id: code.id,
          code: code.code,
          childId: code.childId,
          registryId: code.registryId,
          grade: fromGrade(code.grade as 4 | 6),
          classGroup: code.classGroup,
          status: code.status,
          createdAt: new Date(code.createdAt),
          updatedAt: new Date(code.updatedAt),
        })),
      });
    }

    for (const session of body.store.sessions) {
      await tx.session.create({
        data: {
          id: session.id,
          childId: session.childId,
          campaignId: session.campaignId,
          grade: fromGrade(session.grade as 4 | 6),
          status: session.status,
          startedAt: new Date(session.startedAt),
          pausedAt: session.pausedAt ? new Date(session.pausedAt) : null,
          completedAt: session.completedAt ? new Date(session.completedAt) : null,
          currentQuestionIndex: session.currentQuestionIndex ?? 0,
          recommendation: session.recommendation ?? "",
          scores: session.scores ?? [],
          pauseEvents: session.pauseEvents ?? [],
          quality: session.quality ?? null,
          adminOverride: session.adminOverride ?? null,
          adminState: session.adminState ?? null,
        },
      });

      if (session.answers?.length) {
        await tx.answer.createMany({
          data: session.answers.map((a: Record<string, any>) => ({
            id: a.id ?? crypto.randomUUID(),
            sessionId: session.id,
            questionId: a.questionId,
            batteryId: a.batteryId,
            choiceIndex: a.choiceIndex,
            isCorrect: a.isCorrect,
            answeredAt: new Date(a.answeredAt),
          })),
          skipDuplicates: true,
        });
      }

      if (session.specialistFinalDecision || session.reviewStatus || session.specialistComment) {
        await tx.specialistReview.create({
          data: {
            id: crypto.randomUUID(),
            sessionId: session.id,
            finalDecision: session.specialistFinalDecision,
            reviewStatus: session.reviewStatus,
            comment: session.specialistComment,
          },
        });
      }
    }

    await tx.systemMeta.upsert({
      where: { id: 1 },
      update: { lastBackupAt: body.lastBackupAt ? new Date(body.lastBackupAt) : null },
      create: { id: 1, lastBackupAt: body.lastBackupAt ? new Date(body.lastBackupAt) : null },
    });
  });

  return NextResponse.json({ ok: true });
}
