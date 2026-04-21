import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as {
    completedAt: string;
    scores: unknown[];
    pauseEvents: unknown[];
    quality: unknown;
    recommendation: string;
    adminState: string;
  };
  const target = await prisma.session.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const duplicate = await prisma.session.findFirst({
    where: { id: { not: id }, childId: target.childId, campaignId: target.campaignId, status: "completed" },
  });
  if (duplicate) return NextResponse.json({ error: "DUPLICATE_COMPLETED" }, { status: 409 });

  await prisma.session.update({
    where: { id },
    data: {
      status: "completed",
      completedAt: new Date(body.completedAt),
      pausedAt: null,
      scores: body.scores,
      pauseEvents: body.pauseEvents,
      quality: body.quality,
      recommendation: body.recommendation,
      adminState: body.adminState,
    },
  });

  return NextResponse.json({ ok: true });
}
