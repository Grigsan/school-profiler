import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from "node:sqlite";

const configured = process.env.DATABASE_URL?.trim();
const dbFile = !configured || configured.startsWith("postgres")
  ? path.join(process.cwd(), "data", "app.db")
  : configured.startsWith("file:")
    ? configured.slice("file:".length)
    : configured;

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
const children = db.prepare("SELECT * FROM child ORDER BY createdAt DESC").all();
const accessCodes = db.prepare("SELECT * FROM accessCode ORDER BY createdAt DESC").all();
const sessions = db.prepare("SELECT * FROM session ORDER BY startedAt DESC").all();
const answers = db.prepare("SELECT * FROM answer ORDER BY answeredAt ASC").all();
const reviews = db.prepare("SELECT * FROM specialistReview").all();
const meta = db.prepare("SELECT * FROM systemMeta WHERE id = 1").get() ?? null;

const payload = {
  exportedAt: new Date().toISOString(),
  children,
  accessCodes,
  sessions,
  answers,
  reviews,
  meta,
};

const now = new Date().toISOString().replaceAll(':', '-');
const backupDir = path.join(process.cwd(), 'backups');
const dst = path.join(backupDir, `state-backup-${now}.json`);
await mkdir(backupDir, { recursive: true });
await writeFile(dst, JSON.stringify(payload, null, 2), 'utf-8');
db.prepare("INSERT INTO systemMeta (id, lastBackupAt, updatedAt) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET lastBackupAt = excluded.lastBackupAt, updatedAt = excluded.updatedAt")
  .run(new Date().toISOString(), new Date().toISOString());
db.close();
console.log(`Backup saved: ${dst}`);
