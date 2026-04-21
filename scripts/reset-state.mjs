import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

await prisma.$transaction([
  prisma.answer.deleteMany(),
  prisma.specialistReview.deleteMany(),
  prisma.session.deleteMany(),
  prisma.accessCode.deleteMany(),
  prisma.child.deleteMany(),
  prisma.systemMeta.upsert({ where: { id: 1 }, update: { lastBackupAt: null }, create: { id: 1, lastBackupAt: null } }),
]);

await prisma.$disconnect();
console.log('State reset complete: PostgreSQL tables cleared.');
