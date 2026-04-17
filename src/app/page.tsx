"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Grade = 4 | 6;
type SessionStatus = "active" | "paused" | "completed";

type Child = {
  id: string;
  registryId: string;
  grade: Grade;
  accessCode: string;
  createdAt: string;
};

type Campaign = {
  id: string;
  title: string;
  grade: Grade;
  createdAt: string;
};

type SessionScore = {
  batteryId: string;
  value: number;
};

type SessionAnswer = {
  questionId: string;
  choiceIndex: number;
  isCorrect: boolean;
};

type RecommendationOverride = {
  text: string;
  by: string;
  at: string;
};

type Session = {
  id: string;
  childId: string;
  campaignId: string;
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
};

type Store = {
  children: Child[];
  campaigns: Campaign[];
  sessions: Session[];
};

type Question = {
  id: string;
  batteryId: string;
  batteryLabel: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

const STORAGE_KEY = "school-profiler-store-v1";

const BATTERIES: Record<Grade, { id: string; label: string; min: number; max: number }[]> = {
  4: [
    { id: "reading", label: "Чтение", min: 0, max: 100 },
    { id: "math", label: "Математика", min: 0, max: 100 },
    { id: "attention", label: "Внимание", min: 0, max: 100 },
  ],
  6: [
    { id: "algebra", label: "Алгебра", min: 0, max: 100 },
    { id: "logic", label: "Логика", min: 0, max: 100 },
    { id: "reading6", label: "Понимание текста", min: 0, max: 100 },
  ],
};

const QUESTION_SETS: Record<Grade, Question[]> = {
  4: [
    {
      id: "g4-r1",
      batteryId: "reading",
      batteryLabel: "Чтение",
      prompt: "Выбери предложение, где слово 'лес' употреблено правильно.",
      options: ["Лес плывёт по реке.", "Мы гуляли в лесу.", "Лес варится в кастрюле.", "Лес едет на автобусе."],
      correctIndex: 1,
    },
    {
      id: "g4-r2",
      batteryId: "reading",
      batteryLabel: "Чтение",
      prompt: "Что является главной мыслью текста: 'Осенью птицы улетают в тёплые края'?",
      options: ["Птицы любят зиму.", "Осенью птицы мигрируют.", "Птицы не умеют летать.", "Осенью птицы спят."],
      correctIndex: 1,
    },
    {
      id: "g4-m1",
      batteryId: "math",
      batteryLabel: "Математика",
      prompt: "Сколько будет 48 + 27?",
      options: ["65", "75", "85", "74"],
      correctIndex: 1,
    },
    {
      id: "g4-m2",
      batteryId: "math",
      batteryLabel: "Математика",
      prompt: "У Маши 5 тетрадей, у Пети в 2 раза больше. Сколько у Пети?",
      options: ["7", "8", "10", "12"],
      correctIndex: 2,
    },
    {
      id: "g4-a1",
      batteryId: "attention",
      batteryLabel: "Внимание",
      prompt: "Найди лишнее слово: стол, стул, шкаф, яблоко.",
      options: ["стол", "шкаф", "яблоко", "стул"],
      correctIndex: 2,
    },
    {
      id: "g4-a2",
      batteryId: "attention",
      batteryLabel: "Внимание",
      prompt: "Продолжи ряд: 2, 4, 6, 8, ...",
      options: ["9", "10", "12", "14"],
      correctIndex: 1,
    },
  ],
  6: [
    {
      id: "g6-a1",
      batteryId: "algebra",
      batteryLabel: "Алгебра",
      prompt: "Реши: 3x + 5 = 20. Чему равен x?",
      options: ["3", "4", "5", "6"],
      correctIndex: 2,
    },
    {
      id: "g6-a2",
      batteryId: "algebra",
      batteryLabel: "Алгебра",
      prompt: "Упрости выражение: 2(4 + y)",
      options: ["8 + y", "6y", "8 + 2y", "4 + 2y"],
      correctIndex: 2,
    },
    {
      id: "g6-l1",
      batteryId: "logic",
      batteryLabel: "Логика",
      prompt: "Если все A — это B, и некоторые B — это C, что верно?",
      options: ["Все A — это C", "Некоторые C — это A", "Нельзя точно утверждать, что A и C пересекаются", "Ни одно A не является B"],
      correctIndex: 2,
    },
    {
      id: "g6-l2",
      batteryId: "logic",
      batteryLabel: "Логика",
      prompt: "Какое число продолжает ряд: 1, 1, 2, 3, 5, 8, ...",
      options: ["11", "12", "13", "14"],
      correctIndex: 2,
    },
    {
      id: "g6-r1",
      batteryId: "reading6",
      batteryLabel: "Понимание текста",
      prompt: "Автор пишет: 'Технологии помогают людям учиться быстрее'. Что это означает?",
      options: ["Технологии всегда вредны", "Обучение с технологиями может быть эффективнее", "Учиться больше не нужно", "Книги исчезнут завтра"],
      correctIndex: 1,
    },
    {
      id: "g6-r2",
      batteryId: "reading6",
      batteryLabel: "Понимание текста",
      prompt: "Какой заголовок лучше подходит для текста о бережном отношении к воде?",
      options: ["Как строить самолёты", "Почему важно экономить воду", "История кино", "Путешествие на Марс"],
      correctIndex: 1,
    },
  ],
};

const EMPTY_STORE: Store = {
  children: [],
  campaigns: [],
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

function computeRecommendation(grade: Grade, scores: SessionScore[]): string {
  const relevant = BATTERIES[grade];
  const full = relevant.map((b) => scores.find((s) => s.batteryId === b.id)?.value ?? 0);
  const avg = full.reduce((acc, v) => acc + v, 0) / full.length;
  if (avg >= 80) return "Рекомендован расширенный профиль и углубленная нагрузка.";
  if (avg >= 60) return "Рекомендован стандартный профиль с регулярным сопровождением.";
  return "Рекомендована поддерживающая программа и индивидуальный план.";
}

function computeScoresFromAnswers(grade: Grade, answers: SessionAnswer[]): SessionScore[] {
  const gradeQuestions = QUESTION_SETS[grade];
  return BATTERIES[grade].map((battery) => {
    const batteryQuestions = gradeQuestions.filter((q) => q.batteryId === battery.id);
    const answered = answers.filter((a) => batteryQuestions.some((q) => q.id === a.questionId));
    const correct = answered.filter((a) => a.isCorrect).length;
    const value = answered.length ? Math.round((correct / answered.length) * 100) : 0;
    return { batteryId: battery.id, value };
  });
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

export default function Home() {
  const [store, setStore] = useState<Store>(() => {
    if (typeof window === "undefined") {
      return EMPTY_STORE;
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return EMPTY_STORE;
    }
    try {
      const parsed = JSON.parse(raw) as Store;
      return {
        children: parsed.children ?? [],
        campaigns: parsed.campaigns ?? [],
        sessions: (parsed.sessions ?? []).map((s) => ({
          ...s,
          answers: s.answers ?? [],
          currentQuestionIndex: s.currentQuestionIndex ?? (s.answers?.length ?? 0),
        })),
      };
    } catch {
      return EMPTY_STORE;
    }
  });
  const [role, setRole] = useState<"admin" | "child">("admin");
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [campaignTitle, setCampaignTitle] = useState("");
  const [campaignGrade, setCampaignGrade] = useState<Grade>(4);
  const [childGrade, setChildGrade] = useState<Grade>(4);
  const [loginCode, setLoginCode] = useState("");
  const [loggedChildId, setLoggedChildId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const childrenByCode = useMemo(() => new Map(store.children.map((c) => [c.accessCode, c])), [store.children]);
  const loggedChild = loggedChildId ? store.children.find((c) => c.id === loggedChildId) : null;

  const childSessions = useMemo(
    () => (loggedChild ? store.sessions.filter((s) => s.childId === loggedChild.id) : []),
    [loggedChild, store.sessions],
  );

  function show(type: "ok" | "error", text: string): void {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2800);
  }

  function addCampaign(e: FormEvent) {
    e.preventDefault();
    const title = campaignTitle.trim();
    if (!title) {
      show("error", "Введите название кампании.");
      return;
    }
    const campaign: Campaign = {
      id: uid("cmp"),
      title,
      grade: campaignGrade,
      createdAt: new Date().toISOString(),
    };
    setStore((prev) => ({ ...prev, campaigns: [campaign, ...prev.campaigns] }));
    setCampaignTitle("");
    show("ok", "Кампания создана.");
  }

  function issueAccessCode() {
    if (!store.campaigns.length) {
      show("error", "Сначала создайте кампанию.");
      return;
    }
    let code = createCode();
    while (childrenByCode.has(code)) {
      code = createCode();
    }
    const child: Child = {
      id: uid("ch"),
      registryId: `ANON-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
      grade: childGrade,
      accessCode: code,
      createdAt: new Date().toISOString(),
    };
    setStore((prev) => ({ ...prev, children: [child, ...prev.children] }));
    show("ok", `Код доступа создан: ${code}`);
  }

  function loginChild(e: FormEvent) {
    e.preventDefault();
    const normalized = loginCode.trim().toUpperCase();
    const child = childrenByCode.get(normalized);
    if (!child) {
      show("error", "Код не найден. Проверьте ввод.");
      return;
    }
    setLoggedChildId(child.id);
    setLoginCode("");
    show("ok", `Вход выполнен. Профиль: ${child.registryId}`);
  }

  function startOrResume(child: Child, campaignId: string) {
    const campaign = store.campaigns.find((c) => c.id === campaignId);
    if (!campaign) {
      show("error", "Кампания не найдена.");
      return;
    }
    if (campaign.grade !== child.grade) {
      show("error", "Нельзя смешивать 4 и 6 классы в одной сессии.");
      return;
    }
    const existingActiveOrPaused = store.sessions.find(
      (s) =>
        s.childId === child.id &&
        s.campaignId === campaign.id &&
        s.status !== "completed" &&
        s.grade === child.grade,
    );

    if (existingActiveOrPaused) {
      setStore((prev) => ({
        ...prev,
        sessions: prev.sessions.map((s) =>
          s.id === existingActiveOrPaused.id
            ? {
                ...s,
                status: "active",
                pausedAt: undefined,
                currentQuestionIndex: Math.min(s.currentQuestionIndex ?? s.answers.length, QUESTION_SETS[s.grade].length),
              }
            : s,
        ),
      }));
      show("ok", "Возобновлена существующая сессия.");
      return;
    }

    const newSession: Session = {
      id: uid("ses"),
      childId: child.id,
      campaignId: campaign.id,
      grade: child.grade,
      status: "active",
      startedAt: new Date().toISOString(),
      answers: [],
      currentQuestionIndex: 0,
      scores: BATTERIES[child.grade].map((b) => ({ batteryId: b.id, value: 0 })),
      recommendation: "",
    };

    setStore((prev) => ({ ...prev, sessions: [newSession, ...prev.sessions] }));
    show("ok", "Новая сессия запущена.");
  }

  function answerQuestion(sessionId: string, selectedIndex: number) {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionId || s.status === "completed") return s;
        const questions = QUESTION_SETS[s.grade];
        const question = questions[s.currentQuestionIndex];
        if (!question) return s;
        const newAnswer: SessionAnswer = {
          questionId: question.id,
          choiceIndex: selectedIndex,
          isCorrect: selectedIndex === question.correctIndex,
        };
        const nextAnswers = [...s.answers, newAnswer];
        const nextScores = computeScoresFromAnswers(s.grade, nextAnswers);
        return {
          ...s,
          answers: nextAnswers,
          currentQuestionIndex: Math.min(s.currentQuestionIndex + 1, questions.length),
          scores: nextScores,
          recommendation: computeRecommendation(s.grade, nextScores),
        };
      }),
    }));
  }

  function pauseSession(sessionId: string) {
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId && s.status !== "completed"
          ? { ...s, status: "paused", pausedAt: new Date().toISOString() }
          : s,
      ),
    }));
    show("ok", "Сессия сохранена и поставлена на паузу.");
  }

  function completeSession(sessionId: string) {
    const target = store.sessions.find((s) => s.id === sessionId);
    if (!target) return;

    const requiredDone = target.answers.length >= QUESTION_SETS[target.grade].length;
    if (!requiredDone) {
      show("error", "Для завершения необходимо ответить на все вопросы батареи.");
      return;
    }

    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        return {
          ...s,
          status: "completed",
          completedAt: new Date().toISOString(),
          recommendation: computeRecommendation(s.grade, s.scores),
        };
      }),
    }));
    show("ok", "Сессия завершена.");
  }

  function adminOverride(sessionId: string, text: string) {
    const normalized = text.trim();
    if (!normalized) {
      show("error", "Введите текст для ручной рекомендации.");
      return;
    }
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              adminOverride: {
                text: normalized,
                by: "admin",
                at: new Date().toISOString(),
              },
            }
          : s,
      ),
    }));
    show("ok", "Рекомендация администратора сохранена.");
  }

  function exportCodes() {
    if (!store.children.length) {
      show("error", "Нет кодов для экспорта.");
      return;
    }
    const rows = [
      ["registryId", "grade", "accessCode", "createdAt"],
      ...store.children.map((c) => [c.registryId, c.grade.toString(), c.accessCode, c.createdAt]),
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

  const completedSessions = store.sessions.filter((s) => s.status === "completed");
  const incompleteSessions = store.sessions.filter((s) => s.status !== "completed");

  const campaignSummary = store.campaigns.map((campaign) => {
    const items = store.sessions.filter((s) => s.campaignId === campaign.id && s.status === "completed");
    const recommendations = items.map((s) => s.adminOverride?.text || s.recommendation).filter(Boolean);
    return { campaign, done: items.length, recommendations };
  });

  return (
    <div className="mx-auto min-h-screen max-w-6xl bg-slate-950 p-6 font-sans text-slate-100">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-white">School Profiler — Demo MVP</h1>
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
        <section className="grid gap-6 md:grid-cols-2">
          <article className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold text-white">Кампании</h2>
            <form className="mb-4 grid gap-2" onSubmit={addCampaign}>
              <input
                className={inputClass}
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="Название кампании"
              />
              <label className="text-sm text-slate-200">
                Класс
                <select
                  className="ml-2 rounded-md border border-slate-500 bg-slate-800 p-1 text-slate-100"
                  value={campaignGrade}
                  onChange={(e) => setCampaignGrade(Number(e.target.value) as Grade)}
                >
                  <option value={4}>4 класс</option>
                  <option value={6}>6 класс</option>
                </select>
              </label>
              <button className={buttonPrimaryClass} type="submit">
                Создать кампанию
              </button>
            </form>
            <ul className="space-y-2 text-sm">
              {store.campaigns.map((c) => (
                <li className="rounded-md border border-slate-700 bg-slate-900 p-2" key={c.id}>
                  {c.title} · {c.grade} класс
                </li>
              ))}
              {!store.campaigns.length && <li className="text-slate-400">Кампаний пока нет.</li>}
            </ul>
          </article>

          <article className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold text-white">Анонимный реестр / коды доступа</h2>
            <div className="mb-3">
              <label className="text-sm text-slate-200">
                Класс ученика
                <select
                  className="ml-2 rounded-md border border-slate-500 bg-slate-800 p-1 text-slate-100"
                  value={childGrade}
                  onChange={(e) => setChildGrade(Number(e.target.value) as Grade)}
                >
                  <option value={4}>4 класс</option>
                  <option value={6}>6 класс</option>
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
                  </tr>
                </thead>
                <tbody>
                  {store.children.map((child) => (
                    <tr className="border-t border-slate-700" key={child.id}>
                      <td className="p-2">{child.registryId}</td>
                      <td className="p-2">{child.grade}</td>
                      <td className="p-2 font-mono text-sky-300">{child.accessCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className={`${cardClass} md:col-span-2`}>
            <h2 className="mb-3 text-lg font-semibold text-white">Пауза / незавершенные сессии</h2>
            <ul className="space-y-2 text-sm">
              {incompleteSessions.map((s) => {
                const child = store.children.find((c) => c.id === s.childId);
                const campaign = store.campaigns.find((c) => c.id === s.campaignId);
                return (
                  <li className="rounded-md border border-slate-700 bg-slate-900 p-2" key={s.id}>
                    {campaign?.title ?? "Кампания удалена"} · {child?.registryId ?? "Профиль удален"} · {s.grade} класс · статус: {s.status}
                  </li>
                );
              })}
              {!incompleteSessions.length && <li className="text-slate-400">Нет незавершенных сессий.</li>}
            </ul>
          </article>

          <article className={`${cardClass} md:col-span-2`}>
            <h2 className="mb-3 text-lg font-semibold text-white">Завершенные сессии и ручная проверка</h2>
            <ul className="space-y-3">
              {completedSessions.map((s) => {
                const child = store.children.find((c) => c.id === s.childId);
                const campaign = store.campaigns.find((c) => c.id === s.campaignId);
                const rec = s.adminOverride?.text || s.recommendation;
                return (
                  <li className="rounded-md border border-slate-700 bg-slate-900 p-3" key={s.id}>
                    <p className="text-sm text-slate-200">
                      {campaign?.title ?? "Кампания удалена"} · {child?.registryId ?? "Профиль удален"} · {s.grade} класс
                    </p>
                    <p className="mb-2 text-sm text-slate-100">Итог: {rec || "—"}</p>
                    <p className="mb-2 text-xs text-slate-300">
                      Баллы: {s.scores.map((score) => `${BATTERIES[s.grade].find((b) => b.id === score.batteryId)?.label}: ${score.value}`).join(" · ")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className={`${inputClass} min-w-80 text-sm`}
                        defaultValue={s.adminOverride?.text || ""}
                        placeholder="Ручная корректировка рекомендации"
                        onBlur={(e) => {
                          if (!e.target.value.trim()) return;
                          adminOverride(s.id, e.target.value);
                        }}
                      />
                      <span className="text-xs text-slate-400">Сохранение при выходе из поля.</span>
                    </div>
                  </li>
                );
              })}
              {!completedSessions.length && <li className="text-slate-400">Завершенных сессий пока нет.</li>}
            </ul>
          </article>

          <article className={`${cardClass} md:col-span-2`}>
            <h2 className="mb-3 text-lg font-semibold text-white">Итоговые рекомендации по кампаниям</h2>
            <ul className="space-y-3 text-sm">
              {campaignSummary.map((item) => (
                <li key={item.campaign.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                  <p className="font-medium text-slate-100">
                    {item.campaign.title} ({item.campaign.grade} класс) — завершено: {item.done}
                  </p>
                  <ul className="list-disc pl-5 text-slate-200">
                    {item.recommendations.length ? (
                      item.recommendations.map((text, i) => <li key={`${item.campaign.id}-${i}`}>{text}</li>)
                    ) : (
                      <li>Рекомендаций пока нет.</li>
                    )}
                  </ul>
                </li>
              ))}
              {!campaignSummary.length && <li className="text-slate-400">Кампаний пока нет.</li>}
            </ul>
          </article>
        </section>
      ) : (
        <section className="grid gap-6">
          <article className={cardClass}>
            <h2 className="mb-3 text-lg font-semibold text-white">Вход ученика по коду</h2>
            {!loggedChild ? (
              <form className="flex flex-wrap gap-2" onSubmit={loginChild}>
                <input
                  className={inputClass}
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  placeholder="Введите код доступа"
                />
                <button className={buttonPrimaryClass} type="submit">
                  Войти
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 text-sm text-slate-100">
                <p>
                  Активный профиль: <strong>{loggedChild.registryId}</strong> ({loggedChild.grade} класс)
                </p>
                <button className={buttonSecondaryClass} onClick={() => setLoggedChildId(null)} type="button">
                  Выйти
                </button>
              </div>
            )}
          </article>

          {loggedChild && (
            <article className={cardClass}>
              <h2 className="mb-3 text-lg font-semibold text-white">Мои кампании и сессии</h2>
              <ul className="mb-4 space-y-2">
                {store.campaigns.map((campaign) => {
                  const invalid = campaign.grade !== loggedChild.grade;
                  const ownSession = childSessions.find(
                    (s) => s.campaignId === campaign.id && s.status !== "completed" && s.grade === loggedChild.grade,
                  );
                  return (
                    <li className="flex flex-wrap items-center gap-2 rounded-md border border-slate-700 bg-slate-900 p-2" key={campaign.id}>
                      <span className="text-slate-100">
                        {campaign.title} · {campaign.grade} класс
                      </span>
                      <button
                        className={buttonSecondaryClass}
                        disabled={invalid}
                        onClick={() => startOrResume(loggedChild, campaign.id)}
                        type="button"
                      >
                        {ownSession ? "Продолжить" : "Начать"}
                      </button>
                      {invalid && <span className="text-xs text-rose-300">Недоступно: другой класс.</span>}
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-3">
                {childSessions
                  .filter((s) => s.status !== "completed")
                  .map((session) => {
                    const campaign = store.campaigns.find((c) => c.id === session.campaignId);
                    const questions = QUESTION_SETS[session.grade];
                    const question = questions[session.currentQuestionIndex];
                    const progressPct = Math.round((session.answers.length / questions.length) * 100);
                    return (
                      <div className="rounded-lg border border-slate-600 bg-slate-900 p-3" key={session.id}>
                        <p className="mb-2 font-medium text-white">
                          {campaign?.title ?? "Кампания"} · {session.grade} класс · статус: {session.status}
                        </p>
                        <p className="mb-2 text-sm text-slate-200">Прогресс: {session.answers.length} / {questions.length} ({progressPct}%)</p>

                        {question ? (
                          <div className="rounded-md border border-slate-500 bg-slate-800 p-3">
                            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-300">{question.batteryLabel}</p>
                            <p className="mb-3 text-base text-slate-100">{question.prompt}</p>
                            <div className="grid gap-2">
                              {question.options.map((option, idx) => (
                                <button
                                  key={`${question.id}-${idx}`}
                                  type="button"
                                  className="w-full rounded-md border border-slate-500 bg-slate-900 px-3 py-2 text-left text-slate-100 hover:border-sky-400 hover:bg-slate-700"
                                  onClick={() => answerQuestion(session.id, idx)}
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="rounded-md border border-emerald-600 bg-emerald-950 p-3 text-sm text-emerald-200">
                            Все вопросы батареи отвечены. Можно завершить тестирование.
                          </p>
                        )}

                        <p className="mt-3 text-sm text-slate-200">Предварительная рекомендация: {session.recommendation || "—"}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            className={buttonSecondaryClass}
                            onClick={() => pauseSession(session.id)}
                            type="button"
                          >
                            Сохранить и поставить на паузу
                          </button>
                          <button
                            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                            onClick={() => completeSession(session.id)}
                            type="button"
                          >
                            Завершить тестирование
                          </button>
                        </div>
                      </div>
                    );
                  })}
                {!childSessions.filter((s) => s.status !== "completed").length && (
                  <p className="text-sm text-slate-400">Активных или паузных сессий нет.</p>
                )}
              </div>

              <div className="mt-5 rounded-md border border-slate-600 bg-slate-900 p-3">
                <h3 className="mb-2 font-semibold text-white">Завершенные сессии</h3>
                <ul className="space-y-1 text-sm text-slate-200">
                  {childSessions
                    .filter((s) => s.status === "completed")
                    .map((s) => {
                      const campaign = store.campaigns.find((c) => c.id === s.campaignId);
                      return (
                        <li key={s.id}>
                          {campaign?.title ?? "Кампания"}: {s.adminOverride?.text || s.recommendation || "—"}
                        </li>
                      );
                    })}
                  {!childSessions.filter((s) => s.status === "completed").length && <li>Пока нет завершенных сессий.</li>}
                </ul>
              </div>
            </article>
          )}
        </section>
      )}
    </div>
  );
}
