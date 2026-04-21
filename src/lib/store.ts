export type Grade = 4 | 6;
export type ClassGroup = "4А" | "4Б" | "6А" | "6Б";

export type Campaign = {
  id: ClassGroup;
  title: ClassGroup;
  grade: Grade;
  createdAt: string;
};

export type Store = {
  children: unknown[];
  accessCodes: unknown[];
  campaigns: Campaign[];
  sessions: unknown[];
  classSummaries?: unknown[];
};

export const FIXED_CAMPAIGNS: Campaign[] = [
  { id: "4А", title: "4А", grade: 4, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "4Б", title: "4Б", grade: 4, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "6А", title: "6А", grade: 6, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "6Б", title: "6Б", grade: 6, createdAt: "2026-01-01T00:00:00.000Z" },
];

export const EMPTY_STORE: Store = {
  children: [],
  accessCodes: [],
  campaigns: FIXED_CAMPAIGNS,
  sessions: [],
};

export function sanitizeStore(input: unknown): Store {
  if (!input || typeof input !== "object") return EMPTY_STORE;
  const raw = input as Record<string, unknown>;
  return {
    children: Array.isArray(raw.children) ? raw.children : [],
    accessCodes: Array.isArray(raw.accessCodes) ? raw.accessCodes : [],
    campaigns: FIXED_CAMPAIGNS,
    sessions: Array.isArray(raw.sessions) ? raw.sessions : [],
    ...(Array.isArray(raw.classSummaries) ? { classSummaries: raw.classSummaries } : {}),
  };
}
