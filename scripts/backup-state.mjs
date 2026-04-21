import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const now = new Date().toISOString().replaceAll(':', '-');
const src = path.join(process.cwd(), 'data', 'state.json');
const backupDir = path.join(process.cwd(), 'backups');
const dst = path.join(backupDir, `state-backup-${now}.json`);
await mkdir(backupDir, { recursive: true });
await cp(src, dst);
console.log(`Backup saved: ${dst}`);
