import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const configured = process.env.DATABASE_URL?.trim();
const dbFile = !configured || configured.startsWith("postgres")
  ? path.join(process.cwd(), "data", "app.db")
  : configured.startsWith("file:")
    ? configured.slice("file:".length)
    : configured;

mkdirSync(path.dirname(dbFile), { recursive: true });
const db = new DatabaseSync(dbFile);
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
  updatedAt TEXT NOT NULL
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
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS answer (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  questionId TEXT NOT NULL,
  batteryId TEXT NOT NULL,
  choiceIndex INTEGER NOT NULL,
  isCorrect INTEGER NOT NULL,
  answeredAt TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS specialistReview (
  id TEXT PRIMARY KEY,
  sessionId TEXT UNIQUE NOT NULL,
  finalDecision TEXT,
  reviewStatus TEXT,
  comment TEXT,
  updatedAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS systemMeta (
  id INTEGER PRIMARY KEY,
  lastBackupAt TEXT,
  updatedAt TEXT NOT NULL
);
`);

try {
  db.exec("BEGIN");
  db.prepare("DELETE FROM answer").run();
  db.prepare("DELETE FROM specialistReview").run();
  db.prepare("DELETE FROM session").run();
  db.prepare("DELETE FROM accessCode").run();
  db.prepare("DELETE FROM child").run();
  db.prepare("INSERT INTO systemMeta (id, lastBackupAt, updatedAt) VALUES (1, NULL, ?) ON CONFLICT(id) DO UPDATE SET lastBackupAt = NULL, updatedAt = excluded.updatedAt")
    .run(new Date().toISOString());
  db.exec("COMMIT");
  console.log(`State reset complete: SQLite tables cleared in ${dbFile}.`);
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}
