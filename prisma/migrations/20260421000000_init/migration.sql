-- Create enums
CREATE TYPE "Grade" AS ENUM ('G4', 'G6');
CREATE TYPE "SessionStatus" AS ENUM ('active', 'paused', 'completed');

CREATE TABLE "Child" (
  "id" TEXT PRIMARY KEY,
  "registryId" TEXT NOT NULL,
  "grade" "Grade" NOT NULL,
  "classGroup" TEXT NOT NULL,
  "accessCode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AccessCode" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "childId" TEXT NOT NULL UNIQUE,
  "registryId" TEXT NOT NULL,
  "grade" "Grade" NOT NULL,
  "classGroup" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessCode_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE
);

CREATE TABLE "Session" (
  "id" TEXT PRIMARY KEY,
  "childId" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "grade" "Grade" NOT NULL,
  "status" "SessionStatus" NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "currentQuestionIndex" INTEGER NOT NULL DEFAULT 0,
  "recommendation" TEXT NOT NULL,
  "adminState" TEXT,
  "scores" JSONB NOT NULL,
  "pauseEvents" JSONB NOT NULL,
  "quality" JSONB,
  "adminOverride" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE
);

CREATE TABLE "Answer" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "batteryId" TEXT NOT NULL,
  "choiceIndex" INTEGER NOT NULL,
  "isCorrect" BOOLEAN NOT NULL,
  "answeredAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Answer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE,
  CONSTRAINT "Answer_sessionId_questionId_key" UNIQUE ("sessionId", "questionId")
);

CREATE TABLE "SpecialistReview" (
  "id" TEXT PRIMARY KEY,
  "sessionId" TEXT NOT NULL UNIQUE,
  "finalDecision" TEXT,
  "reviewStatus" TEXT,
  "comment" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SpecialistReview_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE
);

CREATE TABLE "SystemMeta" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "lastBackupAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "Child_classGroup_idx" ON "Child"("classGroup");
CREATE INDEX "Child_registryId_idx" ON "Child"("registryId");
CREATE INDEX "AccessCode_classGroup_idx" ON "AccessCode"("classGroup");
CREATE INDEX "Session_childId_campaignId_idx" ON "Session"("childId", "campaignId");
CREATE UNIQUE INDEX "Session_open_unique_idx"
ON "Session"("childId", "campaignId", "grade")
WHERE "status" IN ('active', 'paused');
CREATE INDEX "Session_status_idx" ON "Session"("status");
CREATE INDEX "Answer_sessionId_idx" ON "Answer"("sessionId");
