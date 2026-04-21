import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const state = {
  revision: 1,
  updatedAt: new Date().toISOString(),
  lastBackupAt: null,
  store: {
    children: [],
    accessCodes: [],
    campaigns: [
      { id: '4А', title: '4А', grade: 4, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '4Б', title: '4Б', grade: 4, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '6А', title: '6А', grade: 6, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: '6Б', title: '6Б', grade: 6, createdAt: '2026-01-01T00:00:00.000Z' }
    ],
    sessions: []
  }
};

const dataDir = path.join(process.cwd(), 'data');
await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, 'state.json'), JSON.stringify(state, null, 2), 'utf-8');
console.log('State reset complete: data/state.json');
