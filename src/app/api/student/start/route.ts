import { NextResponse } from "next/server";
import { startOrResumeSession } from "@/lib/dbStore";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { childId: string; grade: 4 | 6; campaignId: string; sessionId: string; recommendation: string; startedAt: string; scores: unknown[] };
  const result = await startOrResumeSession(body.childId, body.grade, body.campaignId, {
    id: body.sessionId,
    recommendation: body.recommendation,
    startedAt: body.startedAt,
    scores: body.scores,
  });
  return NextResponse.json(result);
}
