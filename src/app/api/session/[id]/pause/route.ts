import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await request.json()) as { pausedAt: string; pauseEvents: unknown[] };

  await prisma.session.update({
    where: { id },
    data: { status: "paused", pausedAt: new Date(body.pausedAt), pauseEvents: body.pauseEvents },
  });

  return NextResponse.json({ ok: true });
}
