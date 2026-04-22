import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

type Grade = "G4" | "G6";
type SessionStatus = "active" | "paused" | "completed";

type Where = Record<string, unknown>;

type SessionRow = {
  id: string;
  childId: string;
  campaignId: string;
  grade: Grade;
  status: SessionStatus;
  startedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  currentQuestionIndex: number;
  recommendation: string;
  adminState: string | null;
  scores: unknown;
  pauseEvents: unknown;
  quality: unknown;
  adminOverride: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const dbFile = (() => {
  const configured = process.env.DATABASE_URL?.trim();
  const base = !configured || configured.startsWith("postgres")
    ? path.join(process.cwd(), "data", "app.db")
    : configured.startsWith("file:")
      ? configured.slice("file:".length)
      : configured;

  if (process.env.npm_lifecycle_event === "build") {
    return base.replace(/\.db$/, `-build-${process.pid}.db`);
  }

  return base;
})();

mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS child (
  id TEXT PRIMARY KEY,
  registryId TEXT NOT NULL,
  grade TEXT NOT NULL,
  classGroup TEXT NOT NULL,
  accessCode TEXT NOT NULL,
  isActive INTEGER NOT NULL,
  notes TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accessCode (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  childId TEXT UNIQUE NOT NULL,
  registryId TEXT NOT NULL,
  grade TEXT NOT NULL,
  classGroup TEXT NOT NULL,
  status TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(childId) REFERENCES child(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  childId TEXT NOT NULL,
  campaignId TEXT NOT NULL,
  grade TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt TEXT NOT NULL,
  pausedAt TEXT,
  completedAt TEXT,
  currentQuestionIndex INTEGER NOT NULL DEFAULT 0,
  recommendation TEXT NOT NULL,
  adminState TEXT,
  scores TEXT NOT NULL,
  pauseEvents TEXT NOT NULL,
  quality TEXT,
  adminOverride TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(childId) REFERENCES child(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS answer (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  questionId TEXT NOT NULL,
  batteryId TEXT NOT NULL,
  choiceIndex INTEGER NOT NULL,
  isCorrect INTEGER NOT NULL,
  answeredAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  UNIQUE(sessionId, questionId),
  FOREIGN KEY(sessionId) REFERENCES session(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS specialistReview (
  id TEXT PRIMARY KEY,
  sessionId TEXT UNIQUE NOT NULL,
  finalDecision TEXT,
  reviewStatus TEXT,
  comment TEXT,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY(sessionId) REFERENCES session(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS systemMeta (
  id INTEGER PRIMARY KEY,
  lastBackupAt TEXT,
  updatedAt TEXT NOT NULL
);
`);

function dedupeOpenSessionsForUniqueIndex() {
  const duplicateGroups = db
    .prepare(`
      SELECT childId, campaignId, grade, COUNT(*) AS openCount
      FROM session
      WHERE status IN ('active', 'paused')
      GROUP BY childId, campaignId, grade
      HAVING COUNT(*) > 1
    `)
    .all() as Array<{ childId: string; campaignId: string; grade: Grade; openCount: number }>;

  if (!duplicateGroups.length) return;

  const selectOpenSessions = db.prepare(`
    SELECT id
    FROM session
    WHERE childId = ? AND campaignId = ? AND grade = ? AND status IN ('active', 'paused')
    ORDER BY datetime(updatedAt) DESC, datetime(startedAt) DESC, datetime(createdAt) DESC, id DESC
  `);
  const demoteSession = db.prepare(`
    UPDATE session
    SET status = 'completed',
        completedAt = COALESCE(completedAt, pausedAt, updatedAt, startedAt, ?),
        pausedAt = NULL,
        updatedAt = ?,
        adminState = COALESCE(adminState, 'reset')
    WHERE id = ?
  `);

  const now = nowIso();
  for (const group of duplicateGroups) {
    const ranked = selectOpenSessions.all(group.childId, group.campaignId, group.grade) as Array<{ id: string }>;
    ranked.slice(1).forEach((session) => {
      demoteSession.run(now, now, session.id);
    });
  }
}

db.exec("BEGIN IMMEDIATE");
try {
  dedupeOpenSessionsForUniqueIndex();
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS session_open_unique_idx
      ON session (childId, campaignId, grade)
      WHERE status IN ('active', 'paused');
  `);
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function serializeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function toDate(value: string | null) {
  return value ? new Date(value) : null;
}

function mapSession(row: Record<string, unknown>): SessionRow {
  return {
    id: String(row.id),
    childId: String(row.childId),
    campaignId: String(row.campaignId),
    grade: String(row.grade) as Grade,
    status: String(row.status) as SessionStatus,
    startedAt: new Date(String(row.startedAt)),
    pausedAt: toDate((row.pausedAt as string | null) ?? null),
    completedAt: toDate((row.completedAt as string | null) ?? null),
    currentQuestionIndex: Number(row.currentQuestionIndex ?? 0),
    recommendation: String(row.recommendation ?? ""),
    adminState: (row.adminState as string | null) ?? null,
    scores: parseJson((row.scores as string) ?? "[]") ?? [],
    pauseEvents: parseJson((row.pauseEvents as string) ?? "[]") ?? [],
    quality: parseJson((row.quality as string | null) ?? null),
    adminOverride: parseJson((row.adminOverride as string | null) ?? null),
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

function mapAnswer(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sessionId: String(row.sessionId),
    questionId: String(row.questionId),
    batteryId: String(row.batteryId),
    choiceIndex: Number(row.choiceIndex),
    isCorrect: Boolean(Number(row.isCorrect)),
    answeredAt: new Date(String(row.answeredAt)),
    createdAt: new Date(String(row.createdAt)),
  };
}

function whereClause(where?: Where): { sql: string; args: unknown[] } {
  if (!where || !Object.keys(where).length) return { sql: "", args: [] };
  const parts: string[] = [];
  const args: unknown[] = [];
  for (const [key, value] of Object.entries(where)) {
    if (value && typeof value === "object" && "in" in (value as Record<string, unknown>)) {
      const items = (value as { in: unknown[] }).in;
      if (!items.length) continue;
      parts.push(`${key} IN (${items.map(() => "?").join(",")})`);
      args.push(...items);
      continue;
    }
    if (value && typeof value === "object" && "not" in (value as Record<string, unknown>)) {
      parts.push(`${key} != ?`);
      args.push((value as { not: unknown }).not);
      continue;
    }
    parts.push(`${key} = ?`);
    args.push(value);
  }
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", args };
}

async function runDeleteMany(table: string, where?: Where) {
  const { sql, args } = whereClause(where);
  db.prepare(`DELETE FROM ${table}${sql}`).run(...args);
  return { count: Number(db.prepare("SELECT changes() AS c").get().c ?? 0) };
}

const prismaClient = {
  child: {
    async findMany({ orderBy }: { orderBy?: { createdAt: "desc" | "asc" } } = {}) {
      const order = orderBy?.createdAt === "asc" ? "ASC" : "DESC";
      const rows = db.prepare(`SELECT * FROM child ORDER BY createdAt ${order}`).all() as Record<string, unknown>[];
      return rows.map((row) => ({ ...row, isActive: Boolean(Number(row.isActive)), createdAt: new Date(String(row.createdAt)), updatedAt: new Date(String(row.updatedAt)) }));
    },
    async createMany({ data }: { data: Array<Record<string, unknown>> }) {
      const stmt = db.prepare("INSERT INTO child (id, registryId, grade, classGroup, accessCode, isActive, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const now = nowIso();
      for (const row of data) {
        stmt.run(row.id, row.registryId, row.grade, row.classGroup, row.accessCode, row.isActive ? 1 : 0, row.notes ?? null, new Date(String(row.createdAt ?? now)).toISOString(), now);
      }
      return { count: data.length };
    },
    async deleteMany() { return runDeleteMany("child"); },
  },
  accessCode: {
    async findMany({ orderBy }: { orderBy?: { createdAt: "desc" | "asc" } } = {}) {
      const order = orderBy?.createdAt === "asc" ? "ASC" : "DESC";
      const rows = db.prepare(`SELECT * FROM accessCode ORDER BY createdAt ${order}`).all() as Record<string, unknown>[];
      return rows.map((row) => ({ ...row, createdAt: new Date(String(row.createdAt)), updatedAt: new Date(String(row.updatedAt)) }));
    },
    async findUnique({ where, include }: { where: { code?: string }; include?: { child?: boolean } }) {
      if (!where.code) return null;
      const row = db.prepare("SELECT * FROM accessCode WHERE code = ?").get(where.code) as Record<string, unknown> | undefined;
      if (!row) return null;
      const base = { ...row, createdAt: new Date(String(row.createdAt)), updatedAt: new Date(String(row.updatedAt)) };
      if (!include?.child) return base;
      const child = db.prepare("SELECT * FROM child WHERE id = ?").get(row.childId) as Record<string, unknown> | undefined;
      return {
        ...base,
        child: child
          ? { ...child, isActive: Boolean(Number(child.isActive)), createdAt: new Date(String(child.createdAt)), updatedAt: new Date(String(child.updatedAt)) }
          : null,
      };
    },
    async createMany({ data }: { data: Array<Record<string, unknown>> }) {
      const stmt = db.prepare("INSERT INTO accessCode (id, code, childId, registryId, grade, classGroup, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      for (const row of data) {
        stmt.run(row.id, row.code, row.childId, row.registryId, row.grade, row.classGroup, row.status, new Date(String(row.createdAt)).toISOString(), new Date(String(row.updatedAt)).toISOString());
      }
      return { count: data.length };
    },
    async deleteMany() { return runDeleteMany("accessCode"); },
  },
  session: {
    async findMany({ orderBy, include }: { orderBy?: { startedAt: "desc" | "asc" }; include?: { answers?: boolean; specialistReview?: boolean } } = {}) {
      const order = orderBy?.startedAt === "asc" ? "ASC" : "DESC";
      const rows = db.prepare(`SELECT * FROM session ORDER BY startedAt ${order}`).all() as Record<string, unknown>[];
      return rows.map((row) => {
        const mapped = mapSession(row);
        return {
          ...mapped,
          ...(include?.answers
            ? { answers: (db.prepare("SELECT * FROM answer WHERE sessionId = ? ORDER BY answeredAt ASC").all(mapped.id) as Record<string, unknown>[]).map(mapAnswer) }
            : {}),
          ...(include?.specialistReview
            ? {
                specialistReview:
                  (db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(mapped.id) as Record<string, unknown> | undefined)
                    ? {
                        ...(db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(mapped.id) as Record<string, unknown>),
                        updatedAt: new Date(String((db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(mapped.id) as Record<string, unknown>).updatedAt)),
                      }
                    : null,
              }
            : {}),
        };
      });
    },
    async findUnique({ where, include }: { where: { id: string }; include?: { answers?: boolean; specialistReview?: boolean } }) {
      const row = db.prepare("SELECT * FROM session WHERE id = ?").get(where.id) as Record<string, unknown> | undefined;
      if (!row) return null;
      const mapped = mapSession(row);
      const result: Record<string, unknown> = { ...mapped };
      if (include?.answers) result.answers = (db.prepare("SELECT * FROM answer WHERE sessionId = ? ORDER BY answeredAt ASC").all(mapped.id) as Record<string, unknown>[]).map(mapAnswer);
      if (include?.specialistReview) {
        const review = db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(mapped.id) as Record<string, unknown> | undefined;
        result.specialistReview = review ? { ...review, updatedAt: new Date(String(review.updatedAt)) } : null;
      }
      return result;
    },
    async findFirst({ where, orderBy }: { where: Where; orderBy?: { startedAt?: "desc" | "asc" } }) {
      const { sql, args } = whereClause(where);
      const order = orderBy?.startedAt ? ` ORDER BY startedAt ${orderBy.startedAt.toUpperCase()}` : "";
      const row = db.prepare(`SELECT * FROM session${sql}${order} LIMIT 1`).get(...args) as Record<string, unknown> | undefined;
      return row ? mapSession(row) : null;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const existing = db.prepare("SELECT * FROM session WHERE id = ?").get(where.id) as Record<string, unknown> | undefined;
      if (!existing) throw new Error(`Session not found: ${where.id}`);
      const merged = { ...mapSession(existing), ...data, updatedAt: new Date() } as Record<string, unknown>;
      db.prepare(`UPDATE session SET status=?, startedAt=?, pausedAt=?, completedAt=?, currentQuestionIndex=?, recommendation=?, adminState=?, scores=?, pauseEvents=?, quality=?, adminOverride=?, updatedAt=? WHERE id=?`).run(
        merged.status,
        new Date(String(merged.startedAt)).toISOString(),
        merged.pausedAt ? new Date(String(merged.pausedAt)).toISOString() : null,
        merged.completedAt ? new Date(String(merged.completedAt)).toISOString() : null,
        Number(merged.currentQuestionIndex ?? 0),
        merged.recommendation ?? "",
        merged.adminState ?? null,
        serializeJson(merged.scores),
        serializeJson(merged.pauseEvents),
        serializeJson(merged.quality),
        serializeJson(merged.adminOverride),
        new Date(String(merged.updatedAt)).toISOString(),
        where.id,
      );
      const updated = db.prepare("SELECT * FROM session WHERE id = ?").get(where.id) as Record<string, unknown>;
      return mapSession(updated);
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const now = nowIso();
      db.prepare(`INSERT INTO session (id, childId, campaignId, grade, status, startedAt, pausedAt, completedAt, currentQuestionIndex, recommendation, adminState, scores, pauseEvents, quality, adminOverride, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          data.id,
          data.childId,
          data.campaignId,
          data.grade,
          data.status,
          new Date(String(data.startedAt)).toISOString(),
          data.pausedAt ? new Date(String(data.pausedAt)).toISOString() : null,
          data.completedAt ? new Date(String(data.completedAt)).toISOString() : null,
          Number(data.currentQuestionIndex ?? 0),
          data.recommendation ?? "",
          data.adminState ?? null,
          serializeJson(data.scores ?? []),
          serializeJson(data.pauseEvents ?? []),
          serializeJson(data.quality),
          serializeJson(data.adminOverride),
          now,
          now,
        );
      const row = db.prepare("SELECT * FROM session WHERE id = ?").get(data.id) as Record<string, unknown>;
      return mapSession(row);
    },
    async deleteMany() { return runDeleteMany("session"); },
  },
  answer: {
    async upsert({ where, update, create }: { where: { sessionId_questionId: { sessionId: string; questionId: string } }; update: Record<string, unknown>; create: Record<string, unknown> }) {
      const existing = db.prepare("SELECT * FROM answer WHERE sessionId = ? AND questionId = ?").get(where.sessionId_questionId.sessionId, where.sessionId_questionId.questionId) as Record<string, unknown> | undefined;
      if (existing) {
        db.prepare("UPDATE answer SET choiceIndex=?, isCorrect=?, answeredAt=? WHERE id=?").run(update.choiceIndex, update.isCorrect ? 1 : 0, new Date(String(update.answeredAt)).toISOString(), existing.id);
        return mapAnswer(db.prepare("SELECT * FROM answer WHERE id = ?").get(existing.id) as Record<string, unknown>);
      }
      const now = nowIso();
      db.prepare("INSERT INTO answer (id, sessionId, questionId, batteryId, choiceIndex, isCorrect, answeredAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        create.id,
        create.sessionId,
        create.questionId,
        create.batteryId,
        create.choiceIndex,
        create.isCorrect ? 1 : 0,
        new Date(String(create.answeredAt)).toISOString(),
        now,
      );
      return mapAnswer(db.prepare("SELECT * FROM answer WHERE id = ?").get(create.id) as Record<string, unknown>);
    },
    async findMany({ where }: { where: { sessionId: string } }) {
      return (db.prepare("SELECT * FROM answer WHERE sessionId = ? ORDER BY answeredAt ASC").all(where.sessionId) as Record<string, unknown>[]).map(mapAnswer);
    },
    async createMany({ data, skipDuplicates }: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }) {
      for (const row of data) {
        try {
          db.prepare("INSERT INTO answer (id, sessionId, questionId, batteryId, choiceIndex, isCorrect, answeredAt, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            row.id,
            row.sessionId,
            row.questionId,
            row.batteryId,
            row.choiceIndex,
            row.isCorrect ? 1 : 0,
            new Date(String(row.answeredAt)).toISOString(),
            nowIso(),
          );
        } catch (error) {
          if (!skipDuplicates) throw error;
        }
      }
      return { count: data.length };
    },
    async deleteMany({ where }: { where?: Where } = {}) { return runDeleteMany("answer", where); },
  },
  specialistReview: {
    async upsert({ where, update, create }: { where: { sessionId: string }; update: Record<string, unknown>; create: Record<string, unknown> }) {
      const existing = db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(where.sessionId) as Record<string, unknown> | undefined;
      if (existing) {
        db.prepare("UPDATE specialistReview SET finalDecision=?, reviewStatus=?, comment=?, updatedAt=? WHERE sessionId=?").run(
          update.finalDecision ?? null,
          update.reviewStatus ?? null,
          update.comment ?? null,
          nowIso(),
          where.sessionId,
        );
      } else {
        db.prepare("INSERT INTO specialistReview (id, sessionId, finalDecision, reviewStatus, comment, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
          create.id,
          create.sessionId,
          create.finalDecision ?? null,
          create.reviewStatus ?? null,
          create.comment ?? null,
          nowIso(),
        );
      }
      const row = db.prepare("SELECT * FROM specialistReview WHERE sessionId = ?").get(where.sessionId) as Record<string, unknown>;
      return { ...row, updatedAt: new Date(String(row.updatedAt)) };
    },
    async create({ data }: { data: Record<string, unknown> }) {
      db.prepare("INSERT INTO specialistReview (id, sessionId, finalDecision, reviewStatus, comment, updatedAt) VALUES (?, ?, ?, ?, ?, ?)").run(
        data.id,
        data.sessionId,
        data.finalDecision ?? null,
        data.reviewStatus ?? null,
        data.comment ?? null,
        nowIso(),
      );
      return data;
    },
    async deleteMany({ where }: { where?: Where } = {}) { return runDeleteMany("specialistReview", where); },
  },
  systemMeta: {
    async findUnique({ where }: { where: { id: number } }) {
      const row = db.prepare("SELECT * FROM systemMeta WHERE id = ?").get(where.id) as Record<string, unknown> | undefined;
      return row ? { id: Number(row.id), lastBackupAt: toDate((row.lastBackupAt as string | null) ?? null), updatedAt: new Date(String(row.updatedAt)) } : null;
    },
    async upsert({ where, update, create }: { where: { id: number }; update: { lastBackupAt: Date | null }; create: { id: number; lastBackupAt: Date | null } }) {
      const existing = db.prepare("SELECT id FROM systemMeta WHERE id = ?").get(where.id) as { id: number } | undefined;
      if (existing) {
        db.prepare("UPDATE systemMeta SET lastBackupAt = ?, updatedAt = ? WHERE id = ?").run(update.lastBackupAt?.toISOString() ?? null, nowIso(), where.id);
      } else {
        db.prepare("INSERT INTO systemMeta (id, lastBackupAt, updatedAt) VALUES (?, ?, ?)").run(create.id, create.lastBackupAt?.toISOString() ?? null, nowIso());
      }
      return this.findUnique({ where });
    },
  },
  async $transaction(arg: unknown) {
    if (Array.isArray(arg)) {
      throw new Error("Unsafe $transaction(array) is not supported. Use callback form: prisma.$transaction(async (tx) => { ... }).");
    }
    if (typeof arg !== "function") {
      throw new Error("Invalid $transaction argument. Expected callback form.");
    }

    db.exec("BEGIN");
    try {
      const result = await (arg as (tx: typeof prismaClient) => Promise<unknown>)(prismaClient);
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};

export const prisma: any = prismaClient;
