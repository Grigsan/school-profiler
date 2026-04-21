import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const [children, accessCodes, sessions, answers, reviews, meta] = await Promise.all([
  prisma.child.findMany(),
  prisma.accessCode.findMany(),
  prisma.session.findMany(),
  prisma.answer.findMany(),
  prisma.specialistReview.findMany(),
  prisma.systemMeta.findUnique({ where: { id: 1 } }),
]);

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
await prisma.systemMeta.upsert({ where: { id: 1 }, update: { lastBackupAt: new Date() }, create: { id: 1, lastBackupAt: new Date() } });
await prisma.$disconnect();
console.log(`Backup saved: ${dst}`);
