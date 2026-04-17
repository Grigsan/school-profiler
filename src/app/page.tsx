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
  recommendation: string;
  adminOverride?: RecommendationOverride;
};

type Store = {
  children: Child[];
  campaigns: Campaign[];
  sessions: Session[];
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

const EMPTY_STORE: Store = {
  children: [],
  campaigns: [],
  sessions: [],
};

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
        sessions: parsed.sessions ?? [],
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
          s.id === existingActiveOrPaused.id ? { ...s, status: "active", pausedAt: undefined } : s,
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
      scores: [],
      recommendation: "",
    };

    setStore((prev) => ({ ...prev, sessions: [newSession, ...prev.sessions] }));
    show("ok", "Новая сессия запущена.");
  }

  function updateScore(sessionId: string, batteryId: string, raw: string) {
    const value = Math.max(0, Math.min(100, Number(raw) || 0));
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const nextScores = s.scores.some((x) => x.batteryId === batteryId)
          ? s.scores.map((x) => (x.batteryId === batteryId ? { ...x, value } : x))
          : [...s.scores, { batteryId, value }];
        return {
          ...s,
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
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const required = BATTERIES[s.grade].every((b) => s.scores.some((x) => x.batteryId === b.id));
        if (!required) return s;
        return {
          ...s,
          status: "completed",
          completedAt: new Date().toISOString(),
          recommendation: computeRecommendation(s.grade, s.scores),
        };
      }),
    }));

    const target = store.sessions.find((s) => s.id === sessionId);
    if (!target) return;
    const required = BATTERIES[target.grade].every((b) => target.scores.some((x) => x.batteryId === b.id));
    if (!required) {
      show("error", "Для завершения заполните все батареи тестов.");
      return;
    }
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
    <div className="mx-auto max-w-6xl p-6 font-sans text-slate-900">
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">School Profiler — Demo MVP</h1>
        <button
          className="rounded border px-3 py-2"
          onClick={() => setRole("admin")}
          type="button"
        >
          Режим администратора
        </button>
        <button
          className="rounded border px-3 py-2"
          onClick={() => setRole("child")}
          type="button"
        >
          Режим ученика
        </button>
        <button
          className="rounded border px-3 py-2"
          onClick={() => window.print()}
          type="button"
        >
          Печать текущего экрана
        </button>
      </header>

      {message && (
        <p
          className={`mb-4 rounded p-3 text-sm ${
            message.type === "ok" ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"
          }`}
        >
          {message.text}
        </p>
      )}

      {role === "admin" ? (
        <section className="grid gap-6 md:grid-cols-2">
          <article className="rounded border p-4">
            <h2 className="mb-3 text-lg font-semibold">Кампании</h2>
            <form className="mb-4 grid gap-2" onSubmit={addCampaign}>
              <input
                className="rounded border p-2"
                value={campaignTitle}
                onChange={(e) => setCampaignTitle(e.target.value)}
                placeholder="Название кампании"
              />
              <label className="text-sm">
                Класс
                <select
                  className="ml-2 rounded border p-1"
                  value={campaignGrade}
                  onChange={(e) => setCampaignGrade(Number(e.target.value) as Grade)}
                >
                  <option value={4}>4 класс</option>
                  <option value={6}>6 класс</option>
                </select>
              </label>
              <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">
                Создать кампанию
              </button>
            </form>
            <ul className="space-y-2 text-sm">
              {store.campaigns.map((c) => (
                <li className="rounded border p-2" key={c.id}>
                  {c.title} · {c.grade} класс
                </li>
              ))}
              {!store.campaigns.length && <li className="text-slate-500">Кампаний пока нет.</li>}
            </ul>
          </article>

          <article className="rounded border p-4">
            <h2 className="mb-3 text-lg font-semibold">Анонимный реестр / коды доступа</h2>
            <div className="mb-3">
              <label className="text-sm">
                Класс ученика
                <select
                  className="ml-2 rounded border p-1"
                  value={childGrade}
                  onChange={(e) => setChildGrade(Number(e.target.value) as Grade)}
                >
                  <option value={4}>4 класс</option>
                  <option value={6}>6 класс</option>
                </select>
              </label>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              <button className="rounded bg-slate-900 px-3 py-2 text-white" onClick={issueAccessCode} type="button">
                Выдать код доступа
              </button>
              <button className="rounded border px-3 py-2" onClick={exportCodes} type="button">
                Экспорт кодов (CSV)
              </button>
            </div>
            <div className="max-h-60 overflow-auto rounded border">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="p-2">Registry ID</th>
                    <th className="p-2">Класс</th>
                    <th className="p-2">Код</th>
                  </tr>
                </thead>
                <tbody>
                  {store.children.map((child) => (
                    <tr key={child.id}>
                      <td className="p-2">{child.registryId}</td>
                      <td className="p-2">{child.grade}</td>
                      <td className="p-2 font-mono">{child.accessCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="rounded border p-4 md:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Пауза / незавершенные сессии</h2>
            <ul className="space-y-2 text-sm">
              {incompleteSessions.map((s) => {
                const child = store.children.find((c) => c.id === s.childId);
                const campaign = store.campaigns.find((c) => c.id === s.campaignId);
                return (
                  <li className="rounded border p-2" key={s.id}>
                    {campaign?.title ?? "Кампания удалена"} · {child?.registryId ?? "Профиль удален"} · {s.grade} класс · статус: {s.status}
                  </li>
                );
              })}
              {!incompleteSessions.length && <li className="text-slate-500">Нет незавершенных сессий.</li>}
            </ul>
          </article>

          <article className="rounded border p-4 md:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Завершенные сессии и ручная проверка</h2>
            <ul className="space-y-3">
              {completedSessions.map((s) => {
                const child = store.children.find((c) => c.id === s.childId);
                const campaign = store.campaigns.find((c) => c.id === s.campaignId);
                const rec = s.adminOverride?.text || s.recommendation;
                return (
                  <li className="rounded border p-3" key={s.id}>
                    <p className="text-sm">
                      {campaign?.title ?? "Кампания удалена"} · {child?.registryId ?? "Профиль удален"} · {s.grade} класс
                    </p>
                    <p className="mb-2 text-sm">Итог: {rec || "—"}</p>
                    <div className="flex flex-wrap gap-2">
                      <input
                        className="min-w-80 rounded border p-2 text-sm"
                        defaultValue={s.adminOverride?.text || ""}
                        placeholder="Ручная корректировка рекомендации"
                        onBlur={(e) => {
                          if (!e.target.value.trim()) return;
                          adminOverride(s.id, e.target.value);
                        }}
                      />
                      <span className="text-xs text-slate-500">Сохранение при выходе из поля.</span>
                    </div>
                  </li>
                );
              })}
              {!completedSessions.length && <li className="text-slate-500">Завершенных сессий пока нет.</li>}
            </ul>
          </article>

          <article className="rounded border p-4 md:col-span-2">
            <h2 className="mb-3 text-lg font-semibold">Итоговые рекомендации по кампаниям</h2>
            <ul className="space-y-3 text-sm">
              {campaignSummary.map((item) => (
                <li key={item.campaign.id} className="rounded border p-2">
                  <p className="font-medium">
                    {item.campaign.title} ({item.campaign.grade} класс) — завершено: {item.done}
                  </p>
                  <ul className="list-disc pl-5">
                    {item.recommendations.length ? (
                      item.recommendations.map((text, i) => <li key={`${item.campaign.id}-${i}`}>{text}</li>)
                    ) : (
                      <li>Рекомендаций пока нет.</li>
                    )}
                  </ul>
                </li>
              ))}
              {!campaignSummary.length && <li className="text-slate-500">Кампаний пока нет.</li>}
            </ul>
          </article>
        </section>
      ) : (
        <section className="grid gap-6">
          <article className="rounded border p-4">
            <h2 className="mb-3 text-lg font-semibold">Вход ученика по коду</h2>
            {!loggedChild ? (
              <form className="flex flex-wrap gap-2" onSubmit={loginChild}>
                <input
                  className="rounded border p-2"
                  value={loginCode}
                  onChange={(e) => setLoginCode(e.target.value)}
                  placeholder="Введите код доступа"
                />
                <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">
                  Войти
                </button>
              </form>
            ) : (
              <div className="flex items-center gap-3 text-sm">
                <p>
                  Активный профиль: <strong>{loggedChild.registryId}</strong> ({loggedChild.grade} класс)
                </p>
                <button className="rounded border px-3 py-1" onClick={() => setLoggedChildId(null)} type="button">
                  Выйти
                </button>
              </div>
            )}
          </article>

          {loggedChild && (
            <article className="rounded border p-4">
              <h2 className="mb-3 text-lg font-semibold">Мои кампании и сессии</h2>
              <ul className="mb-4 space-y-2">
                {store.campaigns.map((campaign) => {
                  const invalid = campaign.grade !== loggedChild.grade;
                  const ownSession = childSessions.find(
                    (s) => s.campaignId === campaign.id && s.status !== "completed" && s.grade === loggedChild.grade,
                  );
                  return (
                    <li className="flex flex-wrap items-center gap-2 rounded border p-2" key={campaign.id}>
                      <span>
                        {campaign.title} · {campaign.grade} класс
                      </span>
                      <button
                        className="rounded border px-2 py-1 text-sm"
                        disabled={invalid}
                        onClick={() => startOrResume(loggedChild, campaign.id)}
                        type="button"
                      >
                        {ownSession ? "Продолжить" : "Начать"}
                      </button>
                      {invalid && <span className="text-xs text-red-600">Недоступно: другой класс.</span>}
                    </li>
                  );
                })}
              </ul>

              <div className="space-y-3">
                {childSessions
                  .filter((s) => s.status !== "completed")
                  .map((session) => {
                    const campaign = store.campaigns.find((c) => c.id === session.campaignId);
                    return (
                      <div className="rounded border p-3" key={session.id}>
                        <p className="mb-2 font-medium">
                          {campaign?.title ?? "Кампания"} · {session.grade} класс · статус: {session.status}
                        </p>
                        <div className="grid gap-2 md:grid-cols-3">
                          {BATTERIES[session.grade].map((b) => (
                            <label className="text-sm" key={b.id}>
                              {b.label}
                              <input
                                className="ml-2 w-20 rounded border p-1"
                                min={b.min}
                                max={b.max}
                                type="number"
                                value={session.scores.find((x) => x.batteryId === b.id)?.value ?? ""}
                                onChange={(e) => updateScore(session.id, b.id, e.target.value)}
                              />
                            </label>
                          ))}
                        </div>
                        <p className="mt-2 text-sm">Предварительная рекомендация: {session.recommendation || "—"}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            className="rounded border px-3 py-1 text-sm"
                            onClick={() => pauseSession(session.id)}
                            type="button"
                          >
                            Сохранить и поставить на паузу
                          </button>
                          <button
                            className="rounded bg-emerald-700 px-3 py-1 text-sm text-white"
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
                  <p className="text-sm text-slate-500">Активных или паузных сессий нет.</p>
                )}
              </div>

              <div className="mt-5 rounded border p-3">
                <h3 className="mb-2 font-semibold">Завершенные сессии</h3>
                <ul className="space-y-1 text-sm">
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
