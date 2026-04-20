"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { QUESTION_SETS } from "./itemBank";

type Grade = 4 | 6;
type ClassGroup = "4А" | "4Б" | "6А" | "6Б";
type SessionStatus = "active" | "paused" | "completed";
type SessionAdminState = "default" | "reset" | "reopened";

type Child = {
  id: string;
  registryId: string;
  grade: Grade;
  classGroup: ClassGroup;
  accessCode: string;
  createdAt: string;
};

type AccessCodeStatus = "Выдан" | "Активен" | "Использован" | "Завершён" | "Переоткрыт" | "Сброшен" | "Недействителен";

type AccessCodeRecord = {
  id: string;
  code: string;
  childId: string;
  registryId: string;
  grade: Grade;
  classGroup: ClassGroup;
  status: AccessCodeStatus;
  createdAt: string;
  updatedAt: string;
};

type Campaign = {
  id: ClassGroup;
  title: ClassGroup;
  grade: Grade;
  createdAt: string;
};

type SessionScore = {
  batteryId: string;
  rawScore: number;
  scaledScore: number;
  durationSec: number;
  interpretation: string;
  answered: number;
  correct: number;
};

type SessionAnswer = {
  questionId: string;
  batteryId: string;
  choiceIndex: number;
  isCorrect: boolean;
  answeredAt: string;
};

type RecommendationOverride = {
  text: string;
  by: string;
  at: string;
};

type Session = {
  id: string;
  childId: string;
  campaignId: ClassGroup;
  grade: Grade;
  status: SessionStatus;
  startedAt: string;
  pausedAt?: string;
  completedAt?: string;
  scores: SessionScore[];
  answers: SessionAnswer[];
  currentQuestionIndex: number;
  recommendation: string;
  adminOverride?: RecommendationOverride;
  adminState?: SessionAdminState;
};

type ClassSummaryRow = {
  classGroup: ClassGroup;
  totalStudents: number;
  completed: number;
  notCompleted: number;
  paused: number;
  expertReviewNeeded: number;
  recommendationDistribution: Array<{ label: string; count: number }>;
  domainDifficultyHighlights: string[];
  subskillDifficultyHighlights: string[];
};

type RecommendationCategory = "более сильный профиль" | "базовый / поддерживающий маршрут" | "требуется экспертная проверка";

type SubskillStat = {
  subskill: string;
  label: string;
  accuracyPct: number;
  answered: number;
  domain: string;
};

type Store = {
  children: Child[];
  accessCodes: AccessCodeRecord[];
  campaigns: Campaign[];
  sessions: Session[];
};

type BatteryDefinition = {
  id: string;
  blockTitle: string;
  shortTitle: string;
  min: number;
  max: number;
};

const STORAGE_KEY = "school-profiler-store-v1";
const ADMIN_PIN = "4321";
const DEMO_ADMIN_HELPER_ENABLED = process.env.NODE_ENV !== "production";
const CLASS_GROUPS: ClassGroup[] = ["4А", "4Б", "6А", "6Б"];

function gradeFromClassGroup(group: ClassGroup): Grade {
  return group.startsWith("4") ? 4 : 6;
}

function isClassGroup(value: unknown): value is ClassGroup {
  return typeof value === "string" && CLASS_GROUPS.includes(value as ClassGroup);
}

function normalizeClassGroup(value: unknown, fallbackGrade: Grade): ClassGroup {
  if (isClassGroup(value)) {
    return value as ClassGroup;
  }

  return fallbackGrade === 4 ? "4А" : "6А";
}

const BATTERIES: Record<Grade, BatteryDefinition[]> = {
  4: [
    { id: "intelligence_4", blockTitle: "Блок 1 из 3: Интеллект", shortTitle: "Интеллект", min: 0, max: 100 },
    { id: "logic_4", blockTitle: "Блок 2 из 3: Логика", shortTitle: "Логика", min: 0, max: 100 },
    {
      id: "math_aptitude_4",
      blockTitle: "Блок 3 из 3: Способность к математике",
      shortTitle: "Способность к математике",
      min: 0,
      max: 100,
    },
  ],
  6: [
    { id: "intelligence_6", blockTitle: "Блок 1 из 3: Интеллект", shortTitle: "Интеллект", min: 0, max: 100 },
    { id: "logic_6", blockTitle: "Блок 2 из 3: Логика", shortTitle: "Логика", min: 0, max: 100 },
    {
      id: "math_aptitude_6",
      blockTitle: "Блок 3 из 3: Способность к математике",
      shortTitle: "Способность к математике",
      min: 0,
      max: 100,
    },
  ],
};

const FIXED_CAMPAIGNS: Campaign[] = CLASS_GROUPS.map((group) => ({
  id: group,
  title: group,
  grade: gradeFromClassGroup(group),
  createdAt: "2026-01-01T00:00:00.000Z",
}));

const EMPTY_STORE: Store = {
  children: [],
  accessCodes: [],
  campaigns: FIXED_CAMPAIGNS,
  sessions: [],
};

const cardClass = "rounded-lg border border-slate-700 bg-slate-900 p-4 shadow-sm";
const buttonSecondaryClass =
  "rounded-md border border-slate-500 bg-slate-800 px-3 py-2 text-slate-100 hover:border-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50";
const buttonPrimaryClass =
  "rounded-md bg-blue-500 px-3 py-2 font-medium text-white hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50";
const inputClass =
  "rounded-md border border-slate-500 bg-slate-800 p-2 text-slate-50 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none";

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function createCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function sessionKey(session: Pick<Session, "childId" | "campaignId">): string {
  return `${session.childId}::${session.campaignId}`;
}

function isResumableSession(session: Session): boolean {
  // Shared answerability rule for both child UI rendering and answer handling:
  // paused sessions remain resumable until completion/cancel flows change status.
  return session.status === "active" || session.status === "paused";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toTimestamp(value: string | undefined): number {
  if (!value) return Date.now();
  const ts = new Date(value).getTime();
  return Number.isNaN(ts) ? Date.now() : ts;
}

function scaledFromRaw(raw: number): number {
  return clamp(Math.round(raw / 10), 1, 10);
}

function domainFocusLabel(batteryId: string): string {
  if (batteryId.includes("intelligence")) return "выявления закономерностей и абстракции";
  if (batteryId.includes("logic")) return "логических выводов и согласованности рассуждений";
  return "количественного рассуждения и работы со структурой";
}

function batteryLabel(batteryId: string): string {
  if (batteryId.includes("intelligence")) return "Интеллект";
  if (batteryId.includes("logic")) return "Логика";
  return "Способность к математике";
}

function subskillLabel(subskill: string): string {
  const labels: Record<string, string> = {
    "pattern detection": "распознавании паттернов",
    transformation: "преобразованиях",
    abstraction: "абстрагировании",
    "missing-part reasoning": "поиске недостающей части",
    classification: "классификации",
    ordering: "упорядочивании",
    "relation consistency": "согласованности отношений",
    "simple/advanced inference": "формальных выводах",
    "number pattern": "числовых закономерностях",
    "quantity comparison": "сравнении величин",
    "proportional reasoning": "пропорциональном рассуждении",
    "structural quantitative modeling": "количественном моделировании",
    "spatial-quantitative reasoning": "пространственно-количественных задачах",
  };
  return labels[subskill] ?? subskill;
}

function subskillDiagnostics(grade: Grade, answers: SessionAnswer[], batteryId?: string): string[] {
  const questionPool = QUESTION_SETS[grade].filter((q) => (batteryId ? q.batteryId === batteryId : true));
  if (!questionPool.length) return [];

  const byQuestion = new Map(questionPool.map((q) => [q.id, q]));
  const grouped = new Map<string, { correct: number; total: number }>();

  for (const answer of answers) {
    const q = byQuestion.get(answer.questionId);
    if (!q) continue;
    const entry = grouped.get(q.subskill) ?? { correct: 0, total: 0 };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    grouped.set(q.subskill, entry);
  }

  const stats = [...grouped.entries()].map(([subskill, value]) => ({
    subskill,
    total: value.total,
    accuracy: value.total ? value.correct / value.total : 0,
  }));
  if (!stats.length) return [];

  const strongest = [...stats].sort((a, b) => b.accuracy - a.accuracy || b.total - a.total)[0];
  const weakest = [...stats].sort((a, b) => a.accuracy - b.accuracy || b.total - a.total)[0];
  const messages = [
    `Относительно сильнее проявляется результат в ${subskillLabel(strongest.subskill)}.`,
  ];
  if (strongest.subskill !== weakest.subskill) {
    messages.push(`Зона внимания: поддержка в ${subskillLabel(weakest.subskill)}.`);
  }
  messages.push("Интерпретация ориентировочная и требует сопоставления с наблюдением педагога/психолога.");
  return messages;
}

function interpretationFromScaled(batteryId: string, scaled: number): string {
  const focus = domainFocusLabel(batteryId);
  if (scaled >= 8) return `Выраженно сильная сторона в зоне ${focus}; уместны задания повышенной сложности при сохранении комфортного темпа.`;
  if (scaled >= 5) return `Достаточно сформированный показатель в зоне ${focus}; полезна регулярная практика и постепенное усложнение.`;
  if (scaled >= 3) return `Сниженный показатель в зоне ${focus}; рекомендуется пошаговая поддержка и тренировка базовых операций.`;
  return `Выраженно сниженный показатель в зоне ${focus}; необходим щадящий формат, сопровождение и наблюдение в динамике.`;
}

function absoluteDomainLevel(scaled: number): "high" | "medium" | "low" | "veryLow" {
  if (scaled >= 8) return "high";
  if (scaled >= 5) return "medium";
  if (scaled >= 3) return "low";
  return "veryLow";
}

function buildDomainInterpretation(
  batteryId: string,
  scaled: number,
  domainStats: { max: number; min: number; hasLower: boolean },
): string {
  const focus = domainFocusLabel(batteryId);
  const level = absoluteDomainLevel(scaled);

  if ((level === "low" || level === "veryLow") && scaled === domainStats.max && domainStats.hasLower) {
    return `Относительно более сохранный показатель на фоне остальных в зоне ${focus}; при этом абсолютный уровень остаётся сниженным и требует поддержки.`;
  }

  return interpretationFromScaled(batteryId, scaled);
}

function computeScoresFromAnswers(grade: Grade, answers: SessionAnswer[], startedAt: string): SessionScore[] {
  const batteries = BATTERIES[grade];
  const scores = batteries.map((battery, batteryIndex) => {
    const answered = answers
      .filter((a) => a.batteryId === battery.id)
      .sort((a, b) => toTimestamp(a.answeredAt) - toTimestamp(b.answeredAt));

    const correct = answered.filter((a) => a.isCorrect).length;
    const rawScore = answered.length ? Math.round((correct / answered.length) * 100) : 0;
    const scaledScore = scaledFromRaw(rawScore);

    const previousBatteryId = batteries[batteryIndex - 1]?.id;
    const previousAnswers = previousBatteryId
      ? answers
          .filter((a) => a.batteryId === previousBatteryId)
          .sort((a, b) => toTimestamp(a.answeredAt) - toTimestamp(b.answeredAt))
      : [];

    const blockStartTs = previousAnswers.length
      ? toTimestamp(previousAnswers[previousAnswers.length - 1].answeredAt)
      : toTimestamp(startedAt);
    const blockEndTs = answered.length ? toTimestamp(answered[answered.length - 1].answeredAt) : blockStartTs;
    const durationSec = answered.length ? clamp(Math.round((blockEndTs - blockStartTs) / 1000), 15, 7200) : 0;

    return {
      batteryId: battery.id,
      rawScore,
      scaledScore,
      durationSec,
      interpretation: "",
      answered: answered.length,
      correct,
    };
  });

  const scaledValues = scores.map((score) => score.scaledScore);
  const max = Math.max(...scaledValues);
  const min = Math.min(...scaledValues);

  return scores.map((score) => ({
    ...score,
    interpretation: buildDomainInterpretation(score.batteryId, score.scaledScore, {
      max,
      min,
      hasLower: score.scaledScore > min,
    }),
  }));
}

function computeRecommendation(grade: Grade, scores: SessionScore[]): string {
  const relevant = BATTERIES[grade];
  const scaled = relevant.map((b) => scores.find((s) => s.batteryId === b.id)?.scaledScore ?? 1);
  const avg = scaled.reduce((acc, value) => acc + value, 0) / scaled.length;
  const min = Math.min(...scaled);
  const max = Math.max(...scaled);
  const spread = max - min;
  const strongestDomain = relevant.reduce((best, battery) => {
    const score = scores.find((s) => s.batteryId === battery.id)?.scaledScore ?? 1;
    return score > best.score ? { score, batteryId: battery.id } : best;
  }, { score: 0, batteryId: relevant[0].id });
  const weakestDomain = relevant.reduce((worst, battery) => {
    const score = scores.find((s) => s.batteryId === battery.id)?.scaledScore ?? 10;
    return score < worst.score ? { score, batteryId: battery.id } : worst;
  }, { score: 11, batteryId: relevant[0].id });
  const strongestLevel = absoluteDomainLevel(strongestDomain.score);
  const weakestLevel = absoluteDomainLevel(weakestDomain.score);

  const strongestNote =
    strongestLevel === "high"
      ? `Выраженно сильная сторона: ${batteryLabel(strongestDomain.batteryId)}.`
      : strongestLevel === "medium"
        ? `Наиболее сохранный показатель: ${batteryLabel(strongestDomain.batteryId)} (достаточно сформированный уровень).`
        : `На фоне остальных показателей блок ${batteryLabel(strongestDomain.batteryId).toLowerCase()} выглядит относительно более сохранным, однако общий уровень по всем доменам остаётся сниженным.`;

  const weakestNote =
    weakestLevel === "veryLow"
      ? `Наиболее выраженные трудности наблюдаются в блоке ${batteryLabel(weakestDomain.batteryId).toLowerCase()}.`
      : `Зона наибольших трудностей: ${batteryLabel(weakestDomain.batteryId).toLowerCase()}.`;

  const cautionNote = "Результат носит предварительный и консультативный характер.";
  const hasHighAverage = avg >= 8;
  const hasBalancedMinimum = min >= 6;
  const hasControlledSpread = spread <= 2;
  const canUseStrongestRecommendation = hasHighAverage && hasBalancedMinimum && hasControlledSpread;

  if (canUseStrongestRecommendation) {
    return `Предварительная рекомендация: расширенный профиль с углублёнными задачами и контролем темпа. Основание: средний доменный балл ${avg.toFixed(1)}/10, минимальный доменный показатель ${min}/10, разброс результатов ${spread} балл(а). Профиль демонстрирует устойчиво сильные и согласованные результаты между доменами. ${strongestNote} ${weakestNote} ${cautionNote}`;
  }

  if (hasHighAverage) {
    return `Предварительная рекомендация: базовый маршрут с адресной поддержкой и последующим расширением нагрузки по мере выравнивания профиля. Основание: средний доменный балл ${avg.toFixed(1)}/10, минимальный доменный показатель ${min}/10, разброс результатов ${spread} балл(а). Профиль в целом сильный, однако наблюдается неравномерность результатов между доменами. Требуется дополнительный профессиональный анализ слабейшего домена перед принятием решения. ${strongestNote} ${weakestNote} ${cautionNote}`;
  }

  if (avg >= 5) {
    return `Предварительная рекомендация: базовый маршрут с адресной поддержкой по отдельным зонам. Основание: средний доменный балл ${avg.toFixed(1)}/10, разброс результатов ${spread} балл(а). ${strongestNote} ${weakestNote} ${cautionNote}`;
  }

  return `Предварительная рекомендация: поддерживающий маршрут с поэтапным усилением базовых навыков. Основание: средний доменный балл ${avg.toFixed(1)}/10, минимальный доменный показатель ${min}/10. ${strongestNote} ${weakestNote} Нужна дополнительная оценка специалистом и наблюдение в динамике; автоматическое решение по одной сессии недопустимо. ${cautionNote}`;
}

function formatDateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { hour12: false });
}

function formatDuration(totalSeconds: number): string {
  const normalized = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(normalized / 60);
  const seconds = normalized % 60;
  return `${minutes} мин ${seconds.toString().padStart(2, "0")} сек`;
}

function recommendationBucket(text: string): string {
  const normalized = text.toLowerCase();
  if (normalized.includes("расширенный профиль")) return "Расширенный профиль";
  if (normalized.includes("базовый маршрут")) return "Базовый маршрут";
  if (normalized.includes("поддерживающий маршрут")) return "Поддерживающий маршрут";
  return "Требуется уточнение специалиста";
}

function recommendationCategory(session: Session): RecommendationCategory {
  if (needsExpertReview(session)) return "требуется экспертная проверка";
  const bucket = recommendationBucket(session.adminOverride?.text || session.recommendation).toLowerCase();
  if (bucket.includes("расширенный")) return "более сильный профиль";
  return "базовый / поддерживающий маршрут";
}

function domainColorByLabel(label: string): string {
  if (label === "Интеллект") return "#38bdf8";
  if (label === "Логика") return "#a78bfa";
  return "#34d399";
}

function getSubskillStats(session: Session, batteryId?: string): SubskillStat[] {
  const questionPool = QUESTION_SETS[session.grade].filter((q) => (batteryId ? q.batteryId === batteryId : true));
  const byQuestion = new Map(questionPool.map((q) => [q.id, q]));
  const grouped = new Map<string, { correct: number; total: number; domain: string }>();

  for (const answer of session.answers) {
    const question = byQuestion.get(answer.questionId);
    if (!question) continue;
    const domain = batteryLabel(question.batteryId);
    const key = `${domain}::${question.subskill}`;
    const entry = grouped.get(key) ?? { correct: 0, total: 0, domain };
    entry.total += 1;
    if (answer.isCorrect) entry.correct += 1;
    grouped.set(key, entry);
  }

  return [...grouped.entries()]
    .map(([key, value]) => {
      const [, subskill] = key.split("::");
      return {
        subskill,
        label: subskillLabel(subskill),
        accuracyPct: value.total ? Math.round((value.correct / value.total) * 100) : 0,
        answered: value.total,
        domain: value.domain,
      };
    })
    .sort((a, b) => b.accuracyPct - a.accuracyPct);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function pearson(valuesX: number[], valuesY: number[]): number | null {
  if (valuesX.length !== valuesY.length || valuesX.length < 3) return null;
  const mx = average(valuesX);
  const my = average(valuesY);
  let numerator = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < valuesX.length; i += 1) {
    const vx = valuesX[i] - mx;
    const vy = valuesY[i] - my;
    numerator += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  if (dx === 0 || dy === 0) return null;
  return numerator / Math.sqrt(dx * dy);
}

function rank(values: number[]): number[] {
  const sorted = [...values].map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array(values.length).fill(0);
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].value === sorted[i].value) j += 1;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k += 1) {
      ranks[sorted[k].index] = avgRank;
    }
    i = j;
  }
  return ranks;
}

function spearman(valuesX: number[], valuesY: number[]): number | null {
  if (valuesX.length !== valuesY.length || valuesX.length < 3) return null;
  return pearson(rank(valuesX), rank(valuesY));
}

function needsExpertReview(session: Session): boolean {
  if (session.status !== "completed") return false;
  const scaled = BATTERIES[session.grade].map((battery) => session.scores.find((score) => score.batteryId === battery.id)?.scaledScore ?? 1);
  const min = Math.min(...scaled);
  const max = Math.max(...scaled);
  const spread = max - min;
  return min <= 3 || spread >= 4 || session.recommendation.toLowerCase().includes("дополнительн");
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeAnswers(grade: Grade, answers: Session["answers"]): SessionAnswer[] {
  const gradeQuestions = QUESTION_SETS[grade];
  return asArray<SessionAnswer>(answers).map((answer, index) => {
    const question = gradeQuestions.find((item) => item.id === answer.questionId);
    return {
      ...answer,
      batteryId: answer.batteryId || question?.batteryId || BATTERIES[grade][0].id,
      answeredAt: answer.answeredAt || new Date(Date.now() + index * 1000).toISOString(),
    };
  });
}

function normalizeAccessCodes(rawCodes: unknown, children: Child[]): AccessCodeRecord[] {
  const rawItems = asArray<Partial<AccessCodeRecord>>(rawCodes);
  const childById = new Map(children.map((child) => [child.id, child]));
  const normalizedByCode = new Map<string, AccessCodeRecord>();

  for (const item of rawItems) {
    const fallbackChild = typeof item.childId === "string" ? childById.get(item.childId) : undefined;
    const code = normalizeAccessCode(typeof item.code === "string" ? item.code : fallbackChild?.accessCode ?? "");
    if (!ACCESS_CODE_FORMAT.test(code) || !fallbackChild) continue;

    normalizedByCode.set(code, {
      id: typeof item.id === "string" ? item.id : uid("ac"),
      code,
      childId: fallbackChild.id,
      registryId: fallbackChild.registryId,
      grade: fallbackChild.grade,
      classGroup: fallbackChild.classGroup,
      status: normalizeAccessCodeStatus(item.status),
      createdAt: typeof item.createdAt === "string" ? item.createdAt : fallbackChild.createdAt,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString(),
    });
  }

  for (const child of children) {
    const code = normalizeAccessCode(child.accessCode);
    if (!ACCESS_CODE_FORMAT.test(code) || normalizedByCode.has(code)) continue;
    normalizedByCode.set(code, {
      id: uid("ac"),
      code,
      childId: child.id,
      registryId: child.registryId,
      grade: child.grade,
      classGroup: child.classGroup,
      status: "Выдан",
      createdAt: child.createdAt,
      updatedAt: child.createdAt,
    });
  }

  return [...normalizedByCode.values()].sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
}

function normalizeStore(raw: Store): Store {
  const legacyCampaigns = asArray<Campaign>(raw.campaigns);
  const legacyCampaignMap = new Map(legacyCampaigns.map((campaign) => [campaign.id, campaign]));
  const normalizedChildren: Child[] = asArray<Child>(raw.children).map((child) => {
    const fallbackGrade = child.grade === 6 ? 6 : 4;
    const classGroup = normalizeClassGroup((child as Partial<Child>).classGroup, fallbackGrade);
    return { ...child, grade: gradeFromClassGroup(classGroup), classGroup };
  });
  const childById = new Map(normalizedChildren.map((child) => [child.id, child]));

  const sessions = asArray<Session>(raw.sessions).map((session) => {
    const child = childById.get(session.childId);
    const fallbackGrade = child?.grade ?? session.grade ?? 4;
    const campaignGroupFromLegacy = legacyCampaignMap.get(session.campaignId)?.title;
    // Legacy mapped campaign titles come from storage, so validate them before giving migration priority.
    const mappedLegacyClassGroup = isClassGroup(campaignGroupFromLegacy) ? campaignGroupFromLegacy : undefined;
    const explicitClassGroup = isClassGroup(session.campaignId)
      ? session.campaignId
      : isClassGroup((session as Partial<Session> & { classGroup?: unknown }).classGroup)
        ? (session as Partial<Session> & { classGroup?: unknown }).classGroup
        : undefined;
    // Legacy session.campaignId may be an opaque campaign key (e.g. "cmp-*"), so we must map it to a class group before normalization.
    const classGroup = normalizeClassGroup(mappedLegacyClassGroup ?? explicitClassGroup, fallbackGrade);
    const resolvedGrade = child?.grade ?? gradeFromClassGroup(classGroup);
    const normalizedAnswers = normalizeAnswers(resolvedGrade, session.answers);
    const totalQuestions = QUESTION_SETS[resolvedGrade].length;
    const scores = computeScoresFromAnswers(resolvedGrade, normalizedAnswers, session.startedAt);

    return {
      ...session,
      campaignId: classGroup,
      grade: resolvedGrade,
      answers: normalizedAnswers,
      scores,
      recommendation: computeRecommendation(resolvedGrade, scores),
      currentQuestionIndex: clamp(session.currentQuestionIndex ?? normalizedAnswers.length, 0, totalQuestions),
      adminState: session.adminState ?? "default",
    };
  });

  const completedByPair = new Map<string, Session[]>();
  for (const session of sessions) {
    if (session.status !== "completed") continue;
    const key = sessionKey(session);
    completedByPair.set(key, [...(completedByPair.get(key) ?? []), session]);
  }

  const demotedCompleted = new Set<string>();
  completedByPair.forEach((items) => {
    if (items.length <= 1) return;
    const sorted = [...items].sort((a, b) => toTimestamp(b.completedAt ?? b.startedAt) - toTimestamp(a.completedAt ?? a.startedAt));
    sorted.slice(1).forEach((item) => demotedCompleted.add(item.id));
  });

  return {
    children: normalizedChildren,
    accessCodes: normalizeAccessCodes((raw as Store & { accessCodes?: AccessCodeRecord[] }).accessCodes, normalizedChildren),
    campaigns: FIXED_CAMPAIGNS,
    sessions: sessions.map((session) => {
      if (!demotedCompleted.has(session.id)) return session;
      return {
        ...session,
        status: "paused" as const,
        completedAt: undefined,
        pausedAt: new Date().toISOString(),
        adminState: "reset" as const,
      };
    }),
  };
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll("\"", "\"\"")}"`)
        .join(","),
    )
    .join("\n");
}

function adminStatusLabel(session: Session): string {
  if (session.status === "completed") return "завершена и заблокирована";
  if (session.status === "active") return "в процессе";
  if (session.adminState === "reset" || session.adminState === "reopened") return "сброшена/переоткрыта";
  return "на паузе";
}

const ACCESS_CODE_FORMAT = /^[A-Z0-9]{6}$/;

function normalizeAccessCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "").trim();
}

function maskAccessCode(code: string): string {
  if (code.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, code.length - 4))}${code.slice(-4)}`;
}

function normalizeAccessCodeStatus(status: unknown): AccessCodeStatus {
  if (status === "Недействителен" || status === "Заблокирован" || status === "Аннулирован") return "Недействителен";
  if (status === "Выдан" || status === "Активен" || status === "Использован" || status === "Завершён" || status === "Переоткрыт" || status === "Сброшен") {
    return status;
  }
  return "Выдан";
}

function accessCodeStatus(codeRecord: AccessCodeRecord, sessions: Session[]): AccessCodeStatus {
  // "Сброшен" означает возможность ретейка, тогда как "Недействителен" означает постоянную блокировку входа.
  if (codeRecord.status === "Недействителен") return "Недействителен";

  const childSessions = sessions.filter((session) => session.childId === codeRecord.childId);
  if (!childSessions.length) return codeRecord.status;

  const hasCompleted = childSessions.some((session) => session.status === "completed");
  if (hasCompleted) return "Завершён";

  const mostRecent = [...childSessions].sort((a, b) => toTimestamp(b.startedAt) - toTimestamp(a.startedAt))[0];
  if (mostRecent.adminState === "reopened") return "Переоткрыт";
  if (mostRecent.adminState === "reset") return "Сброшен";
  if (mostRecent.status === "active") return "Активен";
  return "Использован";
}

function isSessionComplete(session: Session): boolean {
  const gradeQuestions = QUESTION_SETS[session.grade];
  const allAnswered = session.answers.length >= gradeQuestions.length;
  if (!allAnswered) return false;

  const byBattery = new Map<string, number>();
  for (const answer of session.answers) {
    byBattery.set(answer.batteryId, (byBattery.get(answer.batteryId) ?? 0) + 1);
  }

  return BATTERIES[session.grade].every((battery) => {
    const batteryTotal = gradeQuestions.filter((question) => question.batteryId === battery.id).length;
    return (byBattery.get(battery.id) ?? 0) >= batteryTotal;
  });
}

export default function Home() {
  const [store, setStore] = useState<Store>(() => {
    if (typeof window === "undefined") return EMPTY_STORE;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STORE;

    try {
      return normalizeStore(JSON.parse(raw) as Store);
    } catch {
      return EMPTY_STORE;
    }
  });

  const [role, setRole] = useState<"admin" | "child">("child");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [adminPinInput, setAdminPinInput] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [demoPinVisible, setDemoPinVisible] = useState(false);
  const [childClassGroup, setChildClassGroup] = useState<ClassGroup>("4А");
  const [loginCode, setLoginCode] = useState("");
  const [loggedChildId, setLoggedChildId] = useState<string | null>(null);
  const [pendingAnswerBySession, setPendingAnswerBySession] = useState<Record<string, string>>({});
  const pendingAnswerBySessionRef = useRef<Record<string, string>>({});

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, campaigns: FIXED_CAMPAIGNS }));
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[dev] failed to persist store to localStorage", error);
      }
    }
  }, [store]);

  const childrenById = useMemo(() => new Map(store.children.map((child) => [child.id, child])), [store.children]);
  const accessCodesByCode = useMemo(
    () => new Map(store.accessCodes.map((record) => [normalizeAccessCode(record.code), record])),
    [store.accessCodes],
  );
  const loggedChild = loggedChildId ? store.children.find((child) => child.id === loggedChildId) : null;

  const childSessions = useMemo(
    () => (loggedChild ? store.sessions.filter((session) => session.childId === loggedChild.id) : []),
    [loggedChild, store.sessions],
  );
  const [selectedReportSessionId, setSelectedReportSessionId] = useState<string>("");
  const [selectedAnalyticsClass, setSelectedAnalyticsClass] = useState<ClassGroup>("4А");

  function show(type: "ok" | "error", text: string): void {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2800);
  }

  async function copyRowsToClipboard(rows: string[][], successMessage: string): Promise<void> {
    const payload = rows.map((row) => row.join("\t")).join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      show("ok", successMessage);
    } catch {
      show("error", "Не удалось скопировать таблицу в буфер обмена.");
    }
  }

  function unlockAdmin(e: FormEvent): void {
    e.preventDefault();
    if (adminPinInput.trim() !== ADMIN_PIN) {
      show("error", "Неверный PIN администратора.");
      return;
    }
    setAdminUnlocked(true);
    setAdminPinInput("");
    show("ok", "Режим администратора открыт.");
  }

  function issueAccessCode(): void {
    let code = createCode();
    while (accessCodesByCode.has(code)) {
      code = createCode();
    }

    const nowIso = new Date().toISOString();
    const child: Child = {
      id: uid("ch"),
      registryId: `ANON-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
      grade: gradeFromClassGroup(childClassGroup),
      classGroup: childClassGroup,
      accessCode: code,
      createdAt: nowIso,
    };

    const codeRecord: AccessCodeRecord = {
      id: uid("ac"),
      code,
      childId: child.id,
      registryId: child.registryId,
      grade: child.grade,
      classGroup: child.classGroup,
      status: "Выдан",
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Keep access code issuance atomic: child profile + canonical access-code registry are written together.
    setStore((prev) => ({
      ...prev,
      campaigns: FIXED_CAMPAIGNS,
      children: [child, ...prev.children],
      accessCodes: [codeRecord, ...prev.accessCodes],
    }));
    if (process.env.NODE_ENV !== "production") {
      console.info("[dev] issued access code", {
        issuedCode: codeRecord.code,
        childId: codeRecord.childId,
        studentId: codeRecord.registryId,
        classGroup: codeRecord.classGroup,
        source: "store.accessCodes",
      });
    }
    show("ok", `Код доступа создан: ${code}`);
  }

  function loginChild(e: FormEvent): void {
    e.preventDefault();
    const normalizedCode = normalizeAccessCode(loginCode);
    if (!ACCESS_CODE_FORMAT.test(normalizedCode)) {
      show("error", "Неверный формат кода. Используйте 6 символов без пробелов.");
      return;
    }

    // Canonical login source is store.accessCodes; do not depend on transient/derived child maps.
    const codeRecord = accessCodesByCode.get(normalizedCode);
    if (!codeRecord) {
      show("error", "Код не найден. Проверьте ввод.");
      return;
    }

    const child = childrenById.get(codeRecord.childId);
    if (!child) {
      show("error", "Ошибка состояния данных. Обратитесь к администратору.");
      return;
    }

    const status = accessCodeStatus(codeRecord, store.sessions);
    if (status === "Завершён") {
      show("error", "Тестирование по этому коду уже завершено.");
      return;
    }
    if (status === "Недействителен") {
      show("error", "Код недействителен. Обратитесь к администратору.");
      return;
    }

    setRole("child");
    setLoggedChildId(child.id);
    setLoginCode("");
    if (process.env.NODE_ENV !== "production") {
      console.info("[dev] child login lookup", {
        inputCode: normalizedCode,
        canonicalSource: "store.accessCodes",
        resolvedChildId: child.id,
        studentId: child.registryId,
        classGroup: child.classGroup,
        status,
      });
    }
    show("ok", `Вход выполнен. Профиль: ${child.registryId}`);
  }

  function startOrResume(child: Child): void {
    const campaignId = child.classGroup;
    const existingCompleted = store.sessions.find(
      (session) =>
        session.childId === child.id &&
        session.campaignId === campaignId &&
        session.status === "completed" &&
        session.grade === child.grade,
    );
    if (existingCompleted) {
      show("error", "Тестирование для вашего класса уже завершено. Повторный проход недоступен.");
      return;
    }

    const existingActiveOrPaused = store.sessions.find(
      (session) =>
        session.childId === child.id &&
        session.campaignId === campaignId &&
        isResumableSession(session) &&
        session.grade === child.grade,
    );

    if (existingActiveOrPaused) {
      const totalQuestions = QUESTION_SETS[existingActiveOrPaused.grade].length;
      setStore((prev) => ({
        ...prev,
        sessions: prev.sessions.map((session) =>
          session.id === existingActiveOrPaused.id
            ? {
                ...session,
                status: "active",
                pausedAt: undefined,
                currentQuestionIndex: clamp(session.currentQuestionIndex, 0, totalQuestions),
              }
            : session,
        ),
      }));
      show("ok", "Возобновлена существующая сессия.");
      return;
    }

    const zeroScores = computeScoresFromAnswers(child.grade, [], new Date().toISOString());
    const newSession: Session = {
      id: uid("ses"),
      childId: child.id,
      campaignId,
      grade: child.grade,
      status: "active",
      startedAt: new Date().toISOString(),
      answers: [],
      currentQuestionIndex: 0,
      scores: zeroScores,
      recommendation: computeRecommendation(child.grade, zeroScores),
    };

    setStore((prev) => ({ ...prev, sessions: [newSession, ...prev.sessions] }));
    show("ok", "Новая сессия запущена.");
  }

  function answerQuestion(sessionId: string, selectedIndex: number): void {
    const currentSession = store.sessions.find((session) => session.id === sessionId && isResumableSession(session));
    if (!currentSession) return;

    const currentQuestion = QUESTION_SETS[currentSession.grade][currentSession.currentQuestionIndex];
    if (!currentQuestion) return;

    const alreadyAnswered = currentSession.answers.some((answer) => answer.questionId === currentQuestion.id);
    const pendingForSession = pendingAnswerBySessionRef.current[sessionId];
    if (pendingForSession && pendingForSession !== currentQuestion.id) {
      delete pendingAnswerBySessionRef.current[sessionId];
    }
    const isPendingForQuestion = pendingForSession === currentQuestion.id;
    if (alreadyAnswered || isPendingForQuestion) return;

    const nextPending = { ...pendingAnswerBySessionRef.current, [sessionId]: currentQuestion.id };
    pendingAnswerBySessionRef.current = nextPending;
    setPendingAnswerBySession(nextPending);

    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId || !isResumableSession(session)) return session;

        const questions = QUESTION_SETS[session.grade];
        const question = questions[session.currentQuestionIndex];
        if (!question) return session;
        if (session.answers.some((answer) => answer.questionId === question.id)) return session;

        const newAnswer: SessionAnswer = {
          questionId: question.id,
          batteryId: question.batteryId,
          choiceIndex: selectedIndex,
          isCorrect: selectedIndex === question.correctIndex,
          answeredAt: new Date().toISOString(),
        };

        const nextAnswers = [...session.answers, newAnswer];
        const nextScores = computeScoresFromAnswers(session.grade, nextAnswers, session.startedAt);

        // Paused sessions are resumable in the child UI, so answer clicks must both
        // reactivate the session and persist the selected answer in the same update.
        return {
          ...session,
          status: "active",
          pausedAt: undefined,
          answers: nextAnswers,
          currentQuestionIndex: clamp(session.currentQuestionIndex + 1, 0, questions.length),
          scores: nextScores,
          recommendation: computeRecommendation(session.grade, nextScores),
        };
      }),
    }));
  }

  function pauseSession(sessionId: string): void {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === sessionId && session.status !== "completed"
          ? { ...session, status: "paused", pausedAt: new Date().toISOString() }
          : session,
      ),
    }));
    show("ok", "Сессия сохранена и поставлена на паузу.");
  }

  function completeSession(sessionId: string): void {
    const target = store.sessions.find((session) => session.id === sessionId);
    if (!target) return;

    const duplicateCompleted = store.sessions.find(
      (session) =>
        session.id !== target.id &&
        session.childId === target.childId &&
        session.campaignId === target.campaignId &&
        session.status === "completed",
    );
    if (duplicateCompleted) {
      show("error", "Для этого класса уже есть завершенная попытка. Дублирование запрещено.");
      return;
    }

    if (!isSessionComplete(target)) {
      show("error", "Сессию можно завершить только после прохождения всех 3 блоков.");
      return;
    }

    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const recomputedScores = computeScoresFromAnswers(session.grade, session.answers, session.startedAt);
        return {
          ...session,
          status: "completed",
          completedAt: new Date().toISOString(),
          scores: recomputedScores,
          recommendation: computeRecommendation(session.grade, recomputedScores),
          adminState: "default",
        };
      }),
    }));
    show("ok", "Сессия завершена.");
  }

  function resetSession(sessionId: string): void {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId) return session;
        const restartedAt = new Date().toISOString();
        const freshScores = computeScoresFromAnswers(session.grade, [], restartedAt);
        return {
          ...session,
          status: "paused",
          startedAt: restartedAt,
          pausedAt: restartedAt,
          completedAt: undefined,
          answers: [],
          currentQuestionIndex: 0,
          scores: freshScores,
          recommendation: computeRecommendation(session.grade, freshScores),
          adminState: "reset",
        };
      }),
    }));
    show("ok", "Попытка сброшена администратором. Ученик может пройти заново.");
  }

  function reopenSession(sessionId: string): void {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId) return session;

        const totalQuestions = QUESTION_SETS[session.grade].length;
        const trimmedAnswers = session.answers.length >= totalQuestions ? session.answers.slice(0, totalQuestions - 1) : session.answers;
        const nextScores = computeScoresFromAnswers(session.grade, trimmedAnswers, session.startedAt);

        return {
          ...session,
          status: "paused",
          pausedAt: new Date().toISOString(),
          completedAt: undefined,
          answers: trimmedAnswers,
          currentQuestionIndex: clamp(trimmedAnswers.length, 0, totalQuestions),
          scores: nextScores,
          recommendation: computeRecommendation(session.grade, nextScores),
          adminState: "reopened",
        };
      }),
    }));
    show("ok", "Попытка переоткрыта администратором.");
  }

  function adminOverride(sessionId: string, text: string): void {
    const normalized = text.trim();
    if (!normalized) {
      show("error", "Введите текст для ручной рекомендации.");
      return;
    }

    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) =>
        session.id === sessionId
          ? {
              ...session,
              adminOverride: {
                text: normalized,
                by: "admin",
                at: new Date().toISOString(),
              },
            }
          : session,
      ),
    }));
    show("ok", "Рекомендация администратора сохранена.");
  }

  function exportCodes(): void {
    if (!adminUnlocked) {
      show("error", "Экспорт доступен только в режиме администратора.");
      return;
    }

    if (!store.accessCodes.length) {
      show("error", "Нет кодов для экспорта.");
      return;
    }

    const rows = [
      ["registryId", "classGroup", "grade", "accessCode", "createdAt"],
      ...store.accessCodes.map((record) => [
        record.registryId,
        record.classGroup,
        record.grade.toString(),
        record.code,
        record.createdAt,
      ]),
    ];

    const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `access-codes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    show("ok", "Список кодов экспортирован в CSV.");
  }

  const completedSessions = store.sessions.filter((session) => session.status === "completed");
  const incompleteSessions = store.sessions.filter((session) => session.status !== "completed");
  const hasChildUsedCode = useMemo(() => {
    const usedIds = new Set<string>();
    store.sessions.forEach((session) => usedIds.add(session.childId));
    return usedIds;
  }, [store.sessions]);

  const selectedReportSession = useMemo(
    () => completedSessions.find((session) => session.id === selectedReportSessionId) ?? completedSessions[0],
    [completedSessions, selectedReportSessionId],
  );

  const classSummaryRows = useMemo<ClassSummaryRow[]>(
    () =>
      CLASS_GROUPS.map((group) => {
        const classChildren = store.children.filter((child) => child.classGroup === group);
        const classSessions = store.sessions.filter((session) => session.campaignId === group);
        const completed = classSessions.filter((session) => session.status === "completed");
        const paused = classSessions.filter((session) => session.status === "paused");
        const recommendationCounter = new Map<string, number>();
        completed.forEach((session) => {
          const label = recommendationBucket(session.adminOverride?.text || session.recommendation);
          recommendationCounter.set(label, (recommendationCounter.get(label) ?? 0) + 1);
        });

        const avgScaledByDomain = BATTERIES[gradeFromClassGroup(group)].map((battery) => {
          const values = completed.map((session) => session.scores.find((score) => score.batteryId === battery.id)?.scaledScore ?? 1);
          const avg = values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
          return { title: battery.shortTitle, avg };
        });
        const hardest = avgScaledByDomain.filter((item) => item.avg > 0).sort((a, b) => a.avg - b.avg).slice(0, 2);
        const subskillMap = new Map<string, number[]>();
        completed.forEach((session) => {
          getSubskillStats(session).forEach((item) => {
            const key = `${item.domain}: ${item.label}`;
            subskillMap.set(key, [...(subskillMap.get(key) ?? []), item.accuracyPct]);
          });
        });
        const hardestSubskills = [...subskillMap.entries()]
          .map(([label, values]) => ({ label, mean: average(values) }))
          .sort((a, b) => a.mean - b.mean)
          .slice(0, 4);

        return {
          classGroup: group,
          totalStudents: classChildren.length,
          completed: completed.length,
          notCompleted: Math.max(classChildren.length - completed.length, 0),
          paused: paused.length,
          expertReviewNeeded: completed.filter((session) => needsExpertReview(session)).length,
          recommendationDistribution: [...recommendationCounter.entries()]
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count),
          domainDifficultyHighlights: hardest.length
            ? hardest.map((item) => `${item.title}: средний scaled ${item.avg.toFixed(1)}/10`)
            : ["Недостаточно завершённых сессий для оценки."],
          subskillDifficultyHighlights: hardestSubskills.length
            ? hardestSubskills.map((item) => `${item.label}: средняя точность ${item.mean.toFixed(1)}%`)
            : ["Недостаточно завершённых сессий для оценки субнавыков."],
        };
      }),
    [store.children, store.sessions],
  );

  const selectedClassCompletedSessions = useMemo(
    () => completedSessions.filter((session) => session.campaignId === selectedAnalyticsClass),
    [completedSessions, selectedAnalyticsClass],
  );

  const completedResultsExportRows = useMemo(() => {
    return [
      [
        "student_id",
        "Класс",
        "Статус",
        "Дата завершения",
        "Интеллект raw/scaled/время",
        "Логика raw/scaled/время",
        "Математика raw/scaled/время",
        "Итоговая рекомендация",
      ],
      ...completedSessions.map((session) => {
        const child = store.children.find((item) => item.id === session.childId);
        const intel = session.scores.find((score) => score.batteryId.includes("intelligence"));
        const logic = session.scores.find((score) => score.batteryId.includes("logic"));
        const math = session.scores.find((score) => score.batteryId.includes("math_aptitude"));
        return [
          child?.registryId ?? "—",
          session.campaignId,
          adminStatusLabel(session),
          formatDateTime(session.completedAt),
          `${intel?.rawScore ?? 0}% / ${intel?.scaledScore ?? 1} / ${formatDuration(intel?.durationSec ?? 0)}`,
          `${logic?.rawScore ?? 0}% / ${logic?.scaledScore ?? 1} / ${formatDuration(logic?.durationSec ?? 0)}`,
          `${math?.rawScore ?? 0}% / ${math?.scaledScore ?? 1} / ${formatDuration(math?.durationSec ?? 0)}`,
          session.adminOverride?.text || session.recommendation,
        ];
      }),
    ];
  }, [completedSessions, store.children]);

  const classSummaryExportRows = useMemo(() => {
    return [
      [
        "Класс",
        "Всего учеников",
        "Завершили",
        "Не завершили",
        "На паузе",
        "Нужен экспертный разбор",
        "Распределение рекомендаций",
        "Трудные домены",
        "Трудные субнавыки",
      ],
      ...classSummaryRows.map((row) => [
        row.classGroup,
        String(row.totalStudents),
        String(row.completed),
        String(row.notCompleted),
        String(row.paused),
        String(row.expertReviewNeeded),
        row.recommendationDistribution.map((item) => `${item.label}: ${item.count}`).join(" | ") || "—",
        row.domainDifficultyHighlights.join(" | "),
        row.subskillDifficultyHighlights.join(" | "),
      ]),
    ];
  }, [classSummaryRows]);

  const childDomainRadarData = useMemo(() => {
    if (!selectedReportSession) return [];
    return BATTERIES[selectedReportSession.grade].map((battery) => {
      const score = selectedReportSession.scores.find((item) => item.batteryId === battery.id);
      return {
        domain: battery.shortTitle,
        scaled: score?.scaledScore ?? 0,
      };
    });
  }, [selectedReportSession]);

  const childDomainComparisonData = useMemo(() => {
    if (!selectedReportSession) return [];
    return BATTERIES[selectedReportSession.grade].map((battery) => {
      const score = selectedReportSession.scores.find((item) => item.batteryId === battery.id);
      return {
        domain: battery.shortTitle,
        raw: score?.rawScore ?? 0,
        scaled: (score?.scaledScore ?? 0) * 10,
        duration: Math.round((score?.durationSec ?? 0) / 6),
      };
    });
  }, [selectedReportSession]);

  const childTimingData = useMemo(() => {
    if (!selectedReportSession) return [];
    return BATTERIES[selectedReportSession.grade].map((battery) => {
      const score = selectedReportSession.scores.find((item) => item.batteryId === battery.id);
      return {
        domain: battery.shortTitle,
        seconds: score?.durationSec ?? 0,
      };
    });
  }, [selectedReportSession]);

  const childSubskillByDomain = useMemo(() => {
    if (!selectedReportSession) return [];
    return BATTERIES[selectedReportSession.grade].map((battery) => ({
      domain: battery.shortTitle,
      items: getSubskillStats(selectedReportSession, battery.id).sort((a, b) => a.label.localeCompare(b.label, "ru")),
    }));
  }, [selectedReportSession]);

  const childProfileSummary = useMemo(() => {
    if (!selectedReportSession) return null;
    const domainScores = BATTERIES[selectedReportSession.grade].map((battery) => {
      const scaled = selectedReportSession.scores.find((item) => item.batteryId === battery.id)?.scaledScore ?? 0;
      return { domain: battery.shortTitle, scaled };
    });
    if (!domainScores.length) return null;
    const strongest = [...domainScores].sort((a, b) => b.scaled - a.scaled)[0];
    const weakest = [...domainScores].sort((a, b) => a.scaled - b.scaled)[0];
    const preserved = [...domainScores].sort((a, b) => b.scaled - a.scaled)[1] ?? strongest;
    const spread = strongest.scaled - weakest.scaled;
    return { strongest, weakest, preserved, spread, uneven: spread >= 3 };
  }, [selectedReportSession]);

  const classDistributionData = useMemo(() => {
    return BATTERIES[gradeFromClassGroup(selectedAnalyticsClass)].flatMap((battery) =>
      selectedClassCompletedSessions.map((session) => ({
        domain: battery.shortTitle,
        scaled: session.scores.find((item) => item.batteryId === battery.id)?.scaledScore ?? 0,
      })),
    );
  }, [selectedAnalyticsClass, selectedClassCompletedSessions]);

  const classAverageData = useMemo(() => {
    const grade = gradeFromClassGroup(selectedAnalyticsClass);
    return BATTERIES[grade].map((battery) => {
      const values = selectedClassCompletedSessions.map(
        (session) => session.scores.find((item) => item.batteryId === battery.id)?.scaledScore ?? 0,
      );
      return { domain: battery.shortTitle, mean: Number(average(values).toFixed(2)) };
    });
  }, [selectedAnalyticsClass, selectedClassCompletedSessions]);

  const classRecommendationData = useMemo(() => {
    const map = new Map<RecommendationCategory, number>([
      ["более сильный профиль", 0],
      ["базовый / поддерживающий маршрут", 0],
      ["требуется экспертная проверка", 0],
    ]);
    selectedClassCompletedSessions.forEach((session) => {
      const key = recommendationCategory(session);
      map.set(key, (map.get(key) ?? 0) + 1);
    });
    return [...map.entries()].map(([label, count]) => ({ label, count }));
  }, [selectedClassCompletedSessions]);

  const classCompletionData = useMemo(() => {
    const classChildren = store.children.filter((child) => child.classGroup === selectedAnalyticsClass);
    const classSessions = store.sessions.filter((session) => session.campaignId === selectedAnalyticsClass);
    const completed = classSessions.filter((session) => session.status === "completed").length;
    const paused = classSessions.filter((session) => session.status === "paused").length;
    const active = classSessions.filter((session) => session.status === "active").length;
    const resetReopened = classSessions.filter((session) => session.adminState === "reset" || session.adminState === "reopened").length;
    return [
      { label: "Завершено", count: completed },
      { label: "На паузе", count: paused + active },
      { label: "Не начато / не завершено", count: Math.max(classChildren.length - completed - paused - active, 0) },
      { label: "Сброшено/переоткрыто", count: resetReopened },
    ];
  }, [selectedAnalyticsClass, store.children, store.sessions]);

  const classSubskillSummaryData = useMemo(() => {
    const grouped = new Map<string, number[]>();
    selectedClassCompletedSessions.forEach((session) => {
      getSubskillStats(session).forEach((item) => {
        const key = `${item.domain}::${item.label}`;
        grouped.set(key, [...(grouped.get(key) ?? []), item.accuracyPct]);
      });
    });
    return [...grouped.entries()]
      .map(([key, values]) => {
        const [domain, label] = key.split("::");
        return { domain, label, mean: Number(average(values).toFixed(1)) };
      })
      .sort((a, b) => b.mean - a.mean)
      .slice(0, 12);
  }, [selectedClassCompletedSessions]);

  const parallelComparisonData = useMemo(() => {
    const grade = gradeFromClassGroup(selectedAnalyticsClass);
    const pair: ClassGroup[] = grade === 4 ? ["4А", "4Б"] : ["6А", "6Б"];
    return BATTERIES[grade].map((battery) => {
      const item: Record<string, string | number> = { domain: battery.shortTitle };
      pair.forEach((group) => {
        const classSessions = completedSessions.filter((session) => session.campaignId === group);
        const values = classSessions.map((session) => session.scores.find((score) => score.batteryId === battery.id)?.scaledScore ?? 0);
        item[group] = Number(average(values).toFixed(2));
      });
      return item;
    });
  }, [completedSessions, selectedAnalyticsClass]);

  const correlationData = useMemo(() => {
    const rows = completedSessions.map((session) => {
      const intelligence = session.scores.find((score) => score.batteryId.includes("intelligence"));
      const logic = session.scores.find((score) => score.batteryId.includes("logic"));
      const math = session.scores.find((score) => score.batteryId.includes("math_aptitude"));
      const totalDuration = session.scores.reduce((acc, score) => acc + score.durationSec, 0);
      const recommendationScore = recommendationCategory(session) === "более сильный профиль" ? 3 : recommendationCategory(session) === "базовый / поддерживающий маршрут" ? 2 : 1;
      return {
        intel_scaled: intelligence?.scaledScore ?? 0,
        logic_scaled: logic?.scaledScore ?? 0,
        math_scaled: math?.scaledScore ?? 0,
        intel_duration: intelligence?.durationSec ?? 0,
        logic_duration: logic?.durationSec ?? 0,
        math_duration: math?.durationSec ?? 0,
        total_duration: totalDuration,
        recommendation_score: recommendationScore,
      };
    });
    const metrics = [
      { key: "intel_scaled", label: "Интеллект (scaled)" },
      { key: "logic_scaled", label: "Логика (scaled)" },
      { key: "math_scaled", label: "Математика (scaled)" },
      { key: "intel_duration", label: "Время: интеллект" },
      { key: "logic_duration", label: "Время: логика" },
      { key: "math_duration", label: "Время: математика" },
      { key: "total_duration", label: "Общее время" },
      { key: "recommendation_score", label: "Балльная рекомендация" },
    ] as const;
    const matrix: Array<{ x: string; y: string; value: number; method: "Pearson" | "Spearman"; n: number }> = [];
    for (const x of metrics) {
      for (const y of metrics) {
        const xs = rows.map((row) => row[x.key]);
        const ys = rows.map((row) => row[y.key]);
        const p = pearson(xs, ys);
        const s = spearman(xs, ys);
        const value = p ?? s ?? 0;
        matrix.push({
          x: x.label,
          y: y.label,
          value: Number(value.toFixed(2)),
          method: p !== null ? "Pearson" : "Spearman",
          n: xs.length,
        });
      }
    }
    const scatter = rows.map((row) => ({
      intel_logic: { x: row.intel_scaled, y: row.logic_scaled },
      logic_math: { x: row.logic_scaled, y: row.math_scaled },
      math_reco: { x: row.math_scaled, y: row.recommendation_score },
      duration_scaled: { x: row.total_duration, y: average([row.intel_scaled, row.logic_scaled, row.math_scaled]) },
    }));
    return { metrics: metrics.map((m) => m.label), matrix, scatter, n: rows.length };
  }, [completedSessions]);

  const subskillCorrelationData = useMemo(() => {
    const domainPairs = [
      ["Интеллект", "Логика"],
      ["Логика", "Способность к математике"],
      ["Интеллект", "Способность к математике"],
    ] as const;
    return domainPairs.map(([left, right]) => {
      const leftVals: number[] = [];
      const rightVals: number[] = [];
      completedSessions.forEach((session) => {
        const stats = getSubskillStats(session);
        const leftDomain = stats.filter((item) => item.domain === left).map((item) => item.accuracyPct);
        const rightDomain = stats.filter((item) => item.domain === right).map((item) => item.accuracyPct);
        if (!leftDomain.length || !rightDomain.length) return;
        leftVals.push(average(leftDomain));
        rightVals.push(average(rightDomain));
      });
      const p = pearson(leftVals, rightVals);
      const s = spearman(leftVals, rightVals);
      return {
        pair: `${left} ↔ ${right}`,
        value: Number((p ?? s ?? 0).toFixed(2)),
        method: p !== null ? "Pearson" : "Spearman",
        n: leftVals.length,
      };
    });
  }, [completedSessions]);

  const activeChildSession = loggedChild
    ? childSessions.find((session) => session.campaignId === loggedChild.classGroup && isResumableSession(session))
    : undefined;
  const completedChildSession = loggedChild
    ? childSessions.find((session) => session.campaignId === loggedChild.classGroup && session.status === "completed")
    : undefined;

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-slate-950 p-6 font-sans text-slate-100">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">School Profiler — Диагностическая батарея</h1>
        <button className={buttonSecondaryClass} onClick={() => setRole("admin")} type="button">
          Режим администратора
        </button>
        <button className={buttonSecondaryClass} onClick={() => setRole("child")} type="button">
          Режим ученика
        </button>
        <button className={buttonSecondaryClass} onClick={() => window.print()} type="button">
          Печать текущего экрана
        </button>
      </header>

      {message && (
        <p
          className={`mb-4 rounded-md border p-3 text-sm ${
            message.type === "ok"
              ? "border-emerald-400 bg-emerald-950 text-emerald-200"
              : "border-rose-400 bg-rose-950 text-rose-200"
          }`}
        >
          {message.text}
        </p>
      )}

      {role === "admin" ? (
        !adminUnlocked ? (
          <section className="grid gap-6">
            <article className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold text-white">Вход администратора</h2>
              <p className="mb-3 text-sm text-slate-300">Для просмотра админ-панелей введите PIN.</p>
              <form className="flex flex-wrap gap-2" onSubmit={unlockAdmin}>
                <input
                  className={inputClass}
                  value={adminPinInput}
                  onChange={(e) => setAdminPinInput(e.target.value)}
                  placeholder="PIN администратора"
                  type="password"
                />
                <button className={buttonPrimaryClass} type="submit">
                  Открыть админ-режим
                </button>
              </form>
              {DEMO_ADMIN_HELPER_ENABLED && (
                <div className="mt-3 rounded-md border border-amber-500/50 bg-amber-950/30 p-3 text-sm text-amber-100">
                  <p className="mb-2 text-xs uppercase tracking-wide text-amber-300">Только для MVP/демо</p>
                  <button
                    className={buttonSecondaryClass}
                    onClick={() => setDemoPinVisible((prev) => !prev)}
                    type="button"
                  >
                    {demoPinVisible ? "Скрыть тестовый PIN" : "Показать тестовый PIN"}
                  </button>
                  {demoPinVisible && <p className="mt-2 font-mono text-base text-amber-200">{ADMIN_PIN}</p>}
                </div>
              )}
            </article>
          </section>
        ) : (
          <section className="grid gap-6 md:grid-cols-2">
            <article className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold text-white">Классы тестирования</h2>
              <ul className="space-y-2 text-sm">
                {FIXED_CAMPAIGNS.map((campaign) => (
                  <li className="rounded-md border border-slate-700 bg-slate-900 p-2" key={campaign.id}>
                    {campaign.title}
                  </li>
                ))}
              </ul>
            </article>

            <article className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold text-white">Анонимный реестр / коды доступа</h2>
              <div className="mb-3">
                <label className="text-sm text-slate-200">
                  Класс ученика
                  <select
                    className="ml-2 rounded-md border border-slate-500 bg-slate-800 p-1 text-slate-100"
                    value={childClassGroup}
                    onChange={(e) => setChildClassGroup(e.target.value as ClassGroup)}
                  >
                    {CLASS_GROUPS.map((group) => (
                      <option key={group} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                <button className={buttonPrimaryClass} onClick={issueAccessCode} type="button">
                  Выдать код доступа
                </button>
                <button className={buttonSecondaryClass} onClick={exportCodes} type="button">
                  Экспорт кодов (CSV)
                </button>
              </div>
              <div className="max-h-60 overflow-auto rounded-md border border-slate-600">
                <table className="w-full text-left text-sm text-slate-100">
                  <thead className="bg-slate-800 text-slate-100">
                    <tr>
                      <th className="p-2">Registry ID</th>
                      <th className="p-2">Класс</th>
                      <th className="p-2">Код</th>
                      <th className="p-2">Статус кода</th>
                    </tr>
                  </thead>
                  <tbody>
                    {store.accessCodes.map((record) => {
                      const status = accessCodeStatus(record, store.sessions);
                      const shouldMask = hasChildUsedCode.has(record.childId) || status === "Завершён";
                      return (
                        <tr className="border-t border-slate-700" key={record.id}>
                          <td className="p-2">{record.registryId}</td>
                          <td className="p-2">{record.classGroup}</td>
                          <td className="p-2 font-mono text-sky-300">{shouldMask ? maskAccessCode(record.code) : record.code}</td>
                          <td className="p-2">{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Пауза / незавершенные сессии</h2>
              <ul className="space-y-2 text-sm">
                {incompleteSessions.map((session) => {
                  const child = store.children.find((item) => item.id === session.childId);
                  return (
                    <li className="rounded-md border border-slate-700 bg-slate-900 p-2" key={session.id}>
                      {session.campaignId} · {child?.registryId ?? "Профиль удалён"} · статус: {adminStatusLabel(session)}
                    </li>
                  );
                })}
                {!incompleteSessions.length && <li className="text-slate-400">Нет незавершенных сессий.</li>}
              </ul>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Индивидуальный отчёт по ребёнку / сессии</h2>
              {completedSessions.length ? (
                <>
                  <div className="mb-3">
                    <label className="text-sm text-slate-200">
                      Выберите завершённую сессию
                      <select
                        className="ml-2 rounded-md border border-slate-500 bg-slate-800 p-1 text-slate-100"
                        value={selectedReportSession?.id ?? ""}
                        onChange={(e) => setSelectedReportSessionId(e.target.value)}
                      >
                        {completedSessions.map((session) => {
                          const child = store.children.find((item) => item.id === session.childId);
                          return (
                            <option key={session.id} value={session.id}>
                              {child?.registryId ?? "Профиль удалён"} · {session.campaignId} · {formatDateTime(session.completedAt)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  </div>

                  {selectedReportSession && (() => {
                    const child = store.children.find((item) => item.id === selectedReportSession.childId);
                    const recommendation = selectedReportSession.adminOverride?.text || selectedReportSession.recommendation;
                    const domainSubskillNotes = BATTERIES[selectedReportSession.grade].map((battery) => ({
                      batteryId: battery.id,
                      title: battery.shortTitle,
                      notes: subskillDiagnostics(
                        selectedReportSession.grade,
                        selectedReportSession.answers.filter((answer) => answer.batteryId === battery.id),
                        battery.id,
                      ),
                    }));

                    return (
                      <div className="space-y-3 rounded-md border border-slate-700 bg-slate-900 p-3">
                        <dl className="grid gap-2 text-sm md:grid-cols-2">
                          <div><dt className="text-slate-400">ID ученика (student_id)</dt><dd className="font-semibold">{child?.registryId ?? "—"}</dd></div>
                          <div><dt className="text-slate-400">Класс</dt><dd className="font-semibold">{selectedReportSession.campaignId}</dd></div>
                          <div><dt className="text-slate-400">Статус сессии</dt><dd>{adminStatusLabel(selectedReportSession)}</dd></div>
                          <div><dt className="text-slate-400">Дата/время завершения</dt><dd>{formatDateTime(selectedReportSession.completedAt)}</dd></div>
                          <div><dt className="text-slate-400">Суммарная длительность</dt><dd>{formatDuration(selectedReportSession.scores.reduce((acc, item) => acc + item.durationSec, 0))}</dd></div>
                        </dl>

                        <div className="overflow-x-auto rounded-md border border-slate-700">
                          <table className="w-full text-left text-xs text-slate-100 md:text-sm">
                            <thead className="bg-slate-800">
                              <tr>
                                <th className="p-2">Домен</th>
                                <th className="p-2">Сырые баллы (raw score)</th>
                                <th className="p-2">Шкальный балл (scaled score)</th>
                                <th className="p-2">Длительность</th>
                                <th className="p-2">Краткая интерпретация</th>
                                <th className="p-2">Субнавыковая интерпретация</th>
                              </tr>
                            </thead>
                            <tbody>
                              {BATTERIES[selectedReportSession.grade].map((battery) => {
                                const score = selectedReportSession.scores.find((item) => item.batteryId === battery.id);
                                const notes = domainSubskillNotes.find((item) => item.batteryId === battery.id)?.notes ?? [];
                                return (
                                  <tr className="border-t border-slate-700" key={`${selectedReportSession.id}-${battery.id}`}>
                                    <td className="p-2">{battery.shortTitle}</td>
                                    <td className="p-2">{score?.rawScore ?? 0}% ({score?.correct ?? 0}/{score?.answered ?? 0})</td>
                                    <td className="p-2">{score?.scaledScore ?? 1}/10</td>
                                    <td className="p-2">{formatDuration(score?.durationSec ?? 0)}</td>
                                    <td className="p-2">{score?.interpretation ?? "—"}</td>
                                    <td className="p-2">{notes.length ? notes.join(" ") : "Недостаточно данных для интерпретации."}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div className="rounded-md border border-emerald-700/70 bg-emerald-950/20 p-3 text-sm text-emerald-100">
                          <p className="font-semibold">Итоговая рекомендация</p>
                          <p>{recommendation || "—"}</p>
                        </div>

                        <div className="rounded-md border border-sky-700/70 bg-sky-950/30 p-3 text-xs text-sky-100">
                          <p className="font-semibold text-sky-200">Методологическая пометка</p>
                          <ul className="mt-1 list-disc space-y-1 pl-5">
                            <li>Результаты предварительные.</li>
                            <li>Рекомендации носят консультативный характер.</li>
                            <li>Финальное образовательное решение требует очного профессионального разбора.</li>
                          </ul>
                        </div>

                        <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                          <p className="text-sm font-semibold text-slate-100">Графики индивидуального отчёта специалиста</p>
                          <p className="mt-1 text-xs text-slate-300">
                            Визуализации встроены в отчёт и интерпретируются совместно с таблицей доменных результатов.
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                            <p className="mb-2 text-sm font-semibold">Профиль доменов (radar, scaled)</p>
                            <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%">
                                <RadarChart data={childDomainRadarData}>
                                  <PolarGrid stroke="#334155" />
                                  <PolarAngleAxis dataKey="domain" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                                  <Tooltip />
                                  <Radar name="Scaled score" dataKey="scaled" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.35} />
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                          <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                            <p className="mb-2 text-sm font-semibold">Профиль ребёнка (кратко)</p>
                            {childProfileSummary ? (
                              <ul className="space-y-2 text-sm text-slate-200">
                                <li>Сильнейшая зона: <strong>{childProfileSummary.strongest.domain}</strong> ({childProfileSummary.strongest.scaled}/10)</li>
                                <li>Слабейшая зона: <strong>{childProfileSummary.weakest.domain}</strong> ({childProfileSummary.weakest.scaled}/10)</li>
                                <li>Относительно сохранная зона: <strong>{childProfileSummary.preserved.domain}</strong></li>
                                <li className={childProfileSummary.uneven ? "text-amber-300" : "text-emerald-300"}>
                                  {childProfileSummary.uneven
                                    ? "Профиль неравномерный: рекомендуется осторожная интерпретация и очный разбор."
                                    : "Профиль относительно согласованный по доменам."}
                                </li>
                              </ul>
                            ) : (
                              <p className="text-sm text-slate-400">Недостаточно данных.</p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                          <p className="mb-2 text-sm font-semibold">Сравнение доменов: raw / scaled / время (нормировано)</p>
                          <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={childDomainComparisonData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="domain" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="raw" name="Raw score (%)" fill="#38bdf8" />
                                <Bar dataKey="scaled" name="Scaled (x10)" fill="#a78bfa" />
                                <Bar dataKey="duration" name="Время (сек / 6)" fill="#34d399" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                          <p className="mb-2 text-sm font-semibold">Время по доменам</p>
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={childTimingData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="domain" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                                <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                                <Tooltip formatter={(value) => formatDuration(Number(value ?? 0))} />
                                <Bar dataKey="seconds" name="Длительность (сек)" fill="#f59e0b" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-md border border-slate-700 bg-slate-950/70 p-3">
                          <p className="text-sm font-semibold">Субнавыковый профиль по доменам</p>
                          {childSubskillByDomain.map((domainItem) => (
                            <div key={`subskill-${domainItem.domain}`} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-300">{domainItem.domain}</p>
                              <div className="h-56">
                                <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={domainItem.items}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 10 }} angle={-15} interval={0} height={72} />
                                    <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} domain={[0, 100]} />
                                    <Tooltip />
                                    <Bar dataKey="accuracyPct" name="Точность субнавыка (%)" fill={domainColorByLabel(domainItem.domain)} />
                                  </BarChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <p className="text-sm text-slate-400">Пока нет завершённых сессий для формирования индивидуального отчёта.</p>
              )}
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Завершенные сессии и ручная проверка</h2>
              <div className="mb-3 rounded-md border border-sky-700/70 bg-sky-950/30 p-3 text-xs text-sky-100">
                <p className="font-semibold text-sky-200">Методологическая пометка</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>Это прототип диагностической батареи: результаты предварительные и ориентировочные.</li>
                  <li>Рекомендации носят консультативный характер и не являются итоговым заключением.</li>
                  <li>Финальное образовательное решение требует очного профессионального разбора.</li>
                  <li>Автоматическое окончательное решение по одной сессии принимать нельзя.</li>
                </ul>
              </div>
              <ul className="space-y-3">
                {completedSessions.map((session) => {
                  const child = store.children.find((item) => item.id === session.childId);
                  const recommendation = session.adminOverride?.text || session.recommendation;
                  const domainSubskillNotes = BATTERIES[session.grade].map((battery) => ({
                    batteryId: battery.id,
                    title: battery.shortTitle,
                    notes: subskillDiagnostics(
                      session.grade,
                      session.answers.filter((answer) => answer.batteryId === battery.id),
                      battery.id,
                    ),
                  }));

                  return (
                    <li className="rounded-md border border-slate-700 bg-slate-900 p-3" key={session.id}>
                      <p className="text-sm text-slate-200">
                        {session.campaignId} · {child?.registryId ?? "Профиль удалён"}
                      </p>
                      <p className="mb-1 text-xs uppercase tracking-wide text-amber-300">Статус: {adminStatusLabel(session)}</p>
                      <p className="mb-3 text-sm text-slate-100">Итоговая рекомендация: {recommendation || "—"}</p>

                      <div className="mb-3 overflow-x-auto rounded-md border border-slate-700">
                        <table className="w-full text-left text-xs text-slate-100 md:text-sm">
                          <thead className="bg-slate-800">
                            <tr>
                              <th className="p-2">Домен</th>
                              <th className="p-2">Raw score</th>
                              <th className="p-2">Scaled score</th>
                              <th className="p-2">Длительность</th>
                              <th className="p-2">Краткая интерпретация</th>
                            </tr>
                          </thead>
                          <tbody>
                            {BATTERIES[session.grade].map((battery) => {
                              const score = session.scores.find((item) => item.batteryId === battery.id);
                              return (
                                <tr className="border-t border-slate-700" key={`${session.id}-${battery.id}`}>
                                  <td className="p-2">{battery.shortTitle}</td>
                                  <td className="p-2">{score?.rawScore ?? 0}% ({score?.correct ?? 0}/{score?.answered ?? 0})</td>
                                  <td className="p-2">{score?.scaledScore ?? 1}/10</td>
                                  <td className="p-2">{score?.durationSec ?? 0} сек</td>
                                  <td className="p-2">{score?.interpretation ?? "—"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mb-3 rounded-md border border-violet-700/60 bg-violet-950/20 p-3 text-xs text-violet-100">
                        <p className="mb-2 font-semibold text-violet-200">Субнавыковая интерпретация (ориентировочно)</p>
                        <ul className="space-y-2">
                          {domainSubskillNotes.map((domainItem) => (
                            <li key={`${session.id}-${domainItem.batteryId}`}>
                              <p className="font-medium">{domainItem.title}</p>
                              <ul className="list-disc pl-5">
                                {(domainItem.notes.length ? domainItem.notes : ["Недостаточно данных для интерпретации."]).map((note, idx) => (
                                  <li key={`${session.id}-${domainItem.batteryId}-${idx}`}>{note}</li>
                                ))}
                              </ul>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <input
                          className={`${inputClass} min-w-80 text-sm`}
                          defaultValue={session.adminOverride?.text || ""}
                          placeholder="Ручная корректировка рекомендации"
                          onBlur={(e) => {
                            if (!e.target.value.trim()) return;
                            adminOverride(session.id, e.target.value);
                          }}
                        />
                        <span className="text-xs text-slate-400">Сохранение при выходе из поля.</span>
                      </div>
                      <details className="mt-3 rounded-md border border-amber-700/70 bg-amber-950/20 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-amber-200">Действия администратора (восстановление)</summary>
                        <p className="mt-2 text-xs text-amber-100">Внимание: эти действия аварийные и могут снова открыть доступ к завершенной попытке.</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="rounded-md border border-amber-300 bg-amber-900/40 px-3 py-2 text-slate-100 hover:bg-amber-800/50"
                            onClick={() => reopenSession(session.id)}
                            type="button"
                          >
                            Переоткрыть попытку (админ)
                          </button>
                          <button
                            className="rounded-md border border-rose-300 bg-rose-900/40 px-3 py-2 text-slate-100 hover:bg-rose-800/50"
                            onClick={() => resetSession(session.id)}
                            type="button"
                          >
                            Сбросить попытку (админ)
                          </button>
                        </div>
                      </details>
                    </li>
                  );
                })}
                {!completedSessions.length && <li className="text-slate-400">Завершенных сессий пока нет.</li>}
              </ul>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Сводка по классам (4А / 4Б / 6А / 6Б)</h2>
              <div className="mb-3">
                <label className="text-sm text-slate-200">
                  Класс для аналитики
                  <select
                    className="ml-2 rounded-md border border-slate-500 bg-slate-800 p-1 text-slate-100"
                    value={selectedAnalyticsClass}
                    onChange={(e) => setSelectedAnalyticsClass(e.target.value as ClassGroup)}
                  >
                    {CLASS_GROUPS.map((group) => (
                      <option key={`analytics-${group}`} value={group}>
                        {group}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="space-y-3 text-sm">
                {classSummaryRows.map((row) => (
                  <div key={row.classGroup} className="rounded-md border border-slate-700 bg-slate-900 p-3">
                    <p className="font-semibold text-slate-100">Класс {row.classGroup}</p>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <p>Всего учеников: <strong>{row.totalStudents}</strong></p>
                      <p>Завершили: <strong>{row.completed}</strong></p>
                      <p>Не завершили: <strong>{row.notCompleted}</strong></p>
                      <p>На паузе: <strong>{row.paused}</strong></p>
                      <p>Требуют экспертного разбора: <strong>{row.expertReviewNeeded}</strong></p>
                    </div>
                    <div className="mt-2">
                      <p className="font-medium text-slate-200">Распределение рекомендаций:</p>
                      <ul className="list-disc pl-5 text-slate-300">
                        {row.recommendationDistribution.length ? (
                          row.recommendationDistribution.map((item) => (
                            <li key={`${row.classGroup}-${item.label}`}>{item.label}: {item.count}</li>
                          ))
                        ) : (
                          <li>Пока нет завершённых рекомендаций.</li>
                        )}
                      </ul>
                    </div>
                    <div className="mt-2">
                      <p className="font-medium text-slate-200">Подсветка трудных доменов:</p>
                      <ul className="list-disc pl-5 text-slate-300">
                        {row.domainDifficultyHighlights.map((item, idx) => (
                          <li key={`${row.classGroup}-hard-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="mt-2">
                      <p className="font-medium text-slate-200">Подсветка трудных субнавыков:</p>
                      <ul className="list-disc pl-5 text-slate-300">
                        {row.subskillDifficultyHighlights.map((item, idx) => (
                          <li key={`${row.classGroup}-subhard-${idx}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <p className="text-sm font-semibold text-slate-100">Графики сводки по классу</p>
                <p className="mt-1 text-xs text-slate-300">
                  Ниже — визуализации по выбранному классу, используемые как часть рабочей сводки специалиста, а не отдельный аналитический экран.
                </p>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Распределение scaled по доменам (выбранный класс)</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="domain" type="category" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <YAxis dataKey="scaled" type="number" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                        <Scatter data={classDistributionData} fill="#38bdf8" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Средние scaled по доменам (выбранный класс)</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classAverageData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="domain" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="mean" name="Средний scaled" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Распределение маршрутов рекомендаций</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={classRecommendationData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis type="category" dataKey="label" width={220} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Количество детей" fill="#a78bfa" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Статус выполнения по классу</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classCompletionData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="label" tick={{ fill: "#cbd5e1", fontSize: 11 }} interval={0} angle={-10} height={56} />
                        <YAxis tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Количество" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Субнавыки класса: средняя точность</p>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={classSubskillSummaryData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" domain={[0, 100]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis type="category" dataKey="label" width={170} tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="mean" name="Средняя точность (%)" fill="#38bdf8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">
                    Сравнение параллелей: {gradeFromClassGroup(selectedAnalyticsClass) === 4 ? "4А vs 4Б" : "6А vs 6Б"}
                  </p>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={parallelComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="domain" tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        {gradeFromClassGroup(selectedAnalyticsClass) === 4 ? (
                          <>
                            <Bar dataKey="4А" fill="#38bdf8" />
                            <Bar dataKey="4Б" fill="#a78bfa" />
                          </>
                        ) : (
                          <>
                            <Bar dataKey="6А" fill="#38bdf8" />
                            <Bar dataKey="6Б" fill="#a78bfa" />
                          </>
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-2 text-lg font-semibold text-white">Исследовательский блок корреляций (только для специалиста, разведочный)</h2>
              <p className="text-sm text-amber-200">
                Корреляции носят ориентировочный характер и не являются доказательством причинно-следственной связи. При малом объёме
                выборки интерпретация должна быть особенно осторожной.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Текущая выборка: N={correlationData.n}. Метод: Pearson для интервалоподобных метрик, fallback на Spearman при необходимости.
              </p>
              <div className="mt-3 rounded-md border border-slate-700 bg-slate-950/70 p-3">
                <p className="mb-2 text-sm font-semibold">Матрица корреляций (heatmap)</p>
                <div className="h-[28rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid stroke="#1e293b" />
                      <XAxis dataKey="x" type="category" interval={0} angle={-22} textAnchor="end" height={110} tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                      <YAxis dataKey="y" type="category" width={150} tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                      <Tooltip />
                      <Scatter data={correlationData.matrix}>
                        {correlationData.matrix.map((item, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={item.value >= 0 ? `rgba(56,189,248,${Math.min(Math.abs(item.value), 1)})` : `rgba(244,114,182,${Math.min(Math.abs(item.value), 1)})`}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Субнавыковые корреляции (агрегированные домены)</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={subskillCorrelationData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis dataKey="pair" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <YAxis domain={[-1, 1]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="value" name="r" fill="#22c55e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-2 list-disc pl-5 text-xs text-slate-300">
                    {subskillCorrelationData.map((item) => (
                      <li key={`subcorr-${item.pair}`}>{item.pair}: r={item.value}, метод {item.method}, N={item.n}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-sm font-semibold">Scatter: Интеллект vs Логика</p>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="intel_logic.x" name="Интеллект" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <YAxis type="number" dataKey="intel_logic.y" name="Логика" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 12 }} />
                        <Tooltip />
                        <Scatter data={correlationData.scatter} fill="#38bdf8" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-xs font-semibold">Логика vs Способность к математике</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="logic_math.x" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <YAxis type="number" dataKey="logic_math.y" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <Tooltip />
                        <Scatter data={correlationData.scatter} fill="#a78bfa" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-xs font-semibold">Математика vs итоговая рекомендация (балльно)</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="math_reco.x" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <YAxis type="number" dataKey="math_reco.y" domain={[0, 3]} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <Tooltip />
                        <Scatter data={correlationData.scatter} fill="#34d399" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-950/70 p-3">
                  <p className="mb-2 text-xs font-semibold">Общее время vs средний scaled</p>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                        <XAxis type="number" dataKey="duration_scaled.x" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <YAxis type="number" dataKey="duration_scaled.y" domain={[0, 10]} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                        <Tooltip />
                        <Scatter data={correlationData.scatter} fill="#f59e0b" />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Экспорт-таблица: завершённые результаты детей</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  className={buttonSecondaryClass}
                  onClick={() => {
                    void copyRowsToClipboard(completedResultsExportRows, "Таблица завершённых результатов скопирована (TSV).");
                  }}
                  type="button"
                >
                  Копировать таблицу (TSV)
                </button>
                <button
                  className={buttonSecondaryClass}
                  onClick={() => {
                    void copyRowsToClipboard(
                      completedResultsExportRows.map((row) => [row.join("; ")]),
                      "Таблица скопирована в одноколоночном виде.",
                    );
                  }}
                  type="button"
                >
                  Копировать в текстовом виде
                </button>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-700">
                <table className="w-full text-left text-xs text-slate-100 md:text-sm">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="p-2">ID ученика</th>
                      <th className="p-2">Класс</th>
                      <th className="p-2">Статус</th>
                      <th className="p-2">Завершено</th>
                      <th className="p-2">Интеллект (raw/scaled/время)</th>
                      <th className="p-2">Логика (raw/scaled/время)</th>
                      <th className="p-2">Математика (raw/scaled/время)</th>
                      <th className="p-2">Итоговая рекомендация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedSessions.map((session) => {
                      const child = store.children.find((item) => item.id === session.childId);
                      const intel = session.scores.find((score) => score.batteryId.includes("intelligence"));
                      const logic = session.scores.find((score) => score.batteryId.includes("logic"));
                      const math = session.scores.find((score) => score.batteryId.includes("math_aptitude"));
                      return (
                        <tr key={`export-completed-${session.id}`} className="border-t border-slate-700">
                          <td className="p-2">{child?.registryId ?? "—"}</td>
                          <td className="p-2">{session.campaignId}</td>
                          <td className="p-2">{adminStatusLabel(session)}</td>
                          <td className="p-2">{formatDateTime(session.completedAt)}</td>
                          <td className="p-2">{intel?.rawScore ?? 0}% / {intel?.scaledScore ?? 1} / {formatDuration(intel?.durationSec ?? 0)}</td>
                          <td className="p-2">{logic?.rawScore ?? 0}% / {logic?.scaledScore ?? 1} / {formatDuration(logic?.durationSec ?? 0)}</td>
                          <td className="p-2">{math?.rawScore ?? 0}% / {math?.scaledScore ?? 1} / {formatDuration(math?.durationSec ?? 0)}</td>
                          <td className="p-2">{session.adminOverride?.text || session.recommendation}</td>
                        </tr>
                      );
                    })}
                    {!completedSessions.length && (
                      <tr>
                        <td className="p-2 text-slate-400" colSpan={8}>Нет завершённых сессий.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>

            <article className={`${cardClass} md:col-span-2`}>
              <h2 className="mb-3 text-lg font-semibold text-white">Экспорт-таблица: сводка классов</h2>
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  className={buttonSecondaryClass}
                  onClick={() => {
                    void copyRowsToClipboard(classSummaryExportRows, "Таблица сводки классов скопирована (TSV).");
                  }}
                  type="button"
                >
                  Копировать таблицу (TSV)
                </button>
              </div>
              <div className="overflow-x-auto rounded-md border border-slate-700">
                <table className="w-full text-left text-xs text-slate-100 md:text-sm">
                  <thead className="bg-slate-800">
                    <tr>
                      <th className="p-2">Класс</th>
                      <th className="p-2">Всего учеников</th>
                      <th className="p-2">Завершили</th>
                      <th className="p-2">Не завершили</th>
                      <th className="p-2">На паузе</th>
                      <th className="p-2">Нужен экспертный разбор</th>
                      <th className="p-2">Распределение рекомендаций</th>
                      <th className="p-2">Трудные домены</th>
                      <th className="p-2">Трудные субнавыки</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classSummaryRows.map((row) => (
                      <tr key={`export-class-${row.classGroup}`} className="border-t border-slate-700">
                        <td className="p-2">{row.classGroup}</td>
                        <td className="p-2">{row.totalStudents}</td>
                        <td className="p-2">{row.completed}</td>
                        <td className="p-2">{row.notCompleted}</td>
                        <td className="p-2">{row.paused}</td>
                        <td className="p-2">{row.expertReviewNeeded}</td>
                        <td className="p-2">{row.recommendationDistribution.map((item) => `${item.label}: ${item.count}`).join(" | ") || "—"}</td>
                        <td className="p-2">{row.domainDifficultyHighlights.join(" | ")}</td>
                        <td className="p-2">{row.subskillDifficultyHighlights.join(" | ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )
      ) : (
        <section className="grid gap-6">
          <article className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold text-white">Вход ученика по коду</h2>
            {!loggedChild ? (
              <form className="flex flex-wrap gap-2" onSubmit={loginChild}>
                <input className={inputClass} value={loginCode} onChange={(e) => setLoginCode(e.target.value)} placeholder="Введите код доступа" />
                <button className={buttonPrimaryClass} type="submit">
                  Войти
                </button>
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-100">
                <p>
                  Активный профиль: <strong>{loggedChild.registryId}</strong> · класс <strong>{loggedChild.classGroup}</strong>
                </p>
                <button className={buttonSecondaryClass} onClick={() => setLoggedChildId(null)} type="button">
                  Выйти
                </button>
              </div>
            )}
          </article>

          {loggedChild && (
            <article className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold text-white">Моя сессия</h2>
              <p className="mb-3 text-sm text-slate-300">Доступный класс тестирования: {loggedChild.classGroup}</p>

              {!activeChildSession && !completedChildSession && (
                <button className={buttonPrimaryClass} onClick={() => startOrResume(loggedChild)} type="button">
                  Начать тестирование
                </button>
              )}

              {completedChildSession && (
                <p className="rounded-md border border-amber-600 bg-amber-950/40 p-3 text-sm text-amber-100">
                  Состояние: тестирование по классу {loggedChild.classGroup} завершено. Повторный проход недоступен.
                </p>
              )}

              {activeChildSession && (() => {
                const questions = QUESTION_SETS[activeChildSession.grade];
                const question = questions[activeChildSession.currentQuestionIndex];
                const progressPct = Math.round((activeChildSession.answers.length / questions.length) * 100);
                const batteries = BATTERIES[activeChildSession.grade];
                const currentBattery = question ? batteries.find((item) => item.id === question.batteryId) : null;
                const answerLockedForQuestion = question
                  ? pendingAnswerBySession[activeChildSession.id] === question.id ||
                    activeChildSession.answers.some((answer) => answer.questionId === question.id)
                  : false;

                return (
                  <div className="rounded-lg border border-slate-600 bg-slate-900 p-3">
                    <p className="mb-2 font-medium text-white">
                      {loggedChild.classGroup} · статус: {activeChildSession.status === "active" ? "в процессе" : "на паузе"}
                    </p>
                    <p className="mb-2 text-sm text-slate-200">Прогресс батареи: {activeChildSession.answers.length} / {questions.length} ({progressPct}%)</p>

                    <div className="mb-3 grid gap-2 md:grid-cols-3">
                      {batteries.map((battery) => {
                        const batteryQuestions = questions.filter((q) => q.batteryId === battery.id);
                        const answeredCount = activeChildSession.answers.filter((answer) => answer.batteryId === battery.id).length;
                        const finished = answeredCount >= batteryQuestions.length;
                        return (
                          <div
                            key={`${activeChildSession.id}-${battery.id}`}
                            className={`rounded-md border p-2 text-xs ${
                              finished ? "border-emerald-500 bg-emerald-900/20 text-emerald-200" : "border-slate-600 bg-slate-800 text-slate-200"
                            }`}
                          >
                            <p className="font-semibold">{battery.blockTitle}</p>
                            <p>Выполнено: {answeredCount}/{batteryQuestions.length}</p>
                          </div>
                        );
                      })}
                    </div>

                    {question ? (
                      <div className="rounded-md border border-slate-500 bg-slate-800 p-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-300">{currentBattery?.blockTitle}</p>
                        <p className="mb-3 text-base text-slate-100">{question.prompt}</p>
                        <div className="grid gap-2">
                          {question.options.map((option, idx) => (
                            <button
                              key={`${question.id}-${idx}`}
                              type="button"
                              className="w-full rounded-md border border-slate-500 bg-slate-900 px-3 py-2 text-left text-slate-100 hover:border-sky-400 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => answerQuestion(activeChildSession.id, idx)}
                              disabled={answerLockedForQuestion}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-md border border-emerald-600 bg-emerald-950 p-3 text-sm text-emerald-200">
                        Все 3 блока завершены. Можно завершить диагностическую сессию.
                      </p>
                    )}

                    <div className="mt-2 flex gap-2">
                      <button className={buttonSecondaryClass} onClick={() => pauseSession(activeChildSession.id)} type="button">
                        Сохранить и поставить на паузу
                      </button>
                      <button
                        className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                        onClick={() => completeSession(activeChildSession.id)}
                        type="button"
                      >
                        Завершить тестирование
                      </button>
                    </div>
                  </div>
                );
              })()}
            </article>
          )}
        </section>
      )}
    </div>
  );
}
