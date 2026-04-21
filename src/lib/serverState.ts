import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { EMPTY_STORE, sanitizeStore, type Store } from "./store";

export type PersistedState = {
  revision: number;
  updatedAt: string;
  lastBackupAt: string | null;
  store: Store;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "state.json");

const EMPTY_PERSISTED_STATE: PersistedState = {
  revision: 0,
  updatedAt: new Date(0).toISOString(),
  lastBackupAt: null,
  store: EMPTY_STORE,
};

export async function readState(): Promise<PersistedState> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      revision: typeof parsed.revision === "number" ? parsed.revision : 0,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
      lastBackupAt: typeof parsed.lastBackupAt === "string" ? parsed.lastBackupAt : null,
      store: sanitizeStore(parsed.store),
    };
  } catch {
    return EMPTY_PERSISTED_STATE;
  }
}

export async function writeState(state: PersistedState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export async function updateState(params: {
  expectedRevision: number;
  store: unknown;
  lastBackupAt?: string | null;
}): Promise<{ ok: true; state: PersistedState } | { ok: false; state: PersistedState }> {
  const current = await readState();
  if (params.expectedRevision !== current.revision) {
    return { ok: false, state: current };
  }

  const next: PersistedState = {
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
    lastBackupAt: params.lastBackupAt === undefined ? current.lastBackupAt : params.lastBackupAt,
    store: sanitizeStore(params.store),
  };

  await writeState(next);
  return { ok: true, state: next };
}

export async function resetState(): Promise<PersistedState> {
  const reset: PersistedState = {
    revision: 1,
    updatedAt: new Date().toISOString(),
    lastBackupAt: null,
    store: EMPTY_STORE,
  };
  await writeState(reset);
  return reset;
}
