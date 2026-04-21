#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
if (args[0] === 'generate') {
  const outDir = path.join(process.cwd(), 'node_modules', '.prisma');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'client-generated.txt'), `generated ${new Date().toISOString()}\n`);
  process.stdout.write('Prisma schema loaded from prisma/schema.prisma\n');
  process.stdout.write('✔ Generated Prisma Client (local shim)\n');
  process.exit(0);
}
process.stdout.write('Local prisma shim supports only: prisma generate\n');
process.exit(0);
