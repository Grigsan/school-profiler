const base = 'http://localhost:3000';

async function jfetch(path, { method='GET', body, cookie } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data, headers: res.headers };
}

const now = new Date().toISOString();
const store = {
  children: [
    { id: 'child-a', registryId: 'A-001', grade: 4, classGroup: '4А', accessCode: 'CODEA1', isActive: true, notes: '', createdAt: now },
    { id: 'child-b', registryId: 'B-001', grade: 4, classGroup: '4А', accessCode: 'CODEB1', isActive: true, notes: '', createdAt: now },
  ],
  accessCodes: [
    { id: 'code-a', code: 'CODEA1', childId: 'child-a', registryId: 'A-001', grade: 4, classGroup: '4А', status: 'Выдан', createdAt: now, updatedAt: now },
    { id: 'code-b', code: 'CODEB1', childId: 'child-b', registryId: 'B-001', grade: 4, classGroup: '4А', status: 'Выдан', createdAt: now, updatedAt: now },
  ],
  sessions: [],
};

const adminLogin = await jfetch('/api/admin/login', { method: 'POST', body: { pin: '69760626' } });
if (adminLogin.status !== 200) throw new Error(`admin login failed ${adminLogin.status}`);
const adminCookie = adminLogin.headers.get('set-cookie')?.split(';')[0];
if (!adminCookie) throw new Error('missing admin cookie');

const imported = await jfetch('/api/admin/import', { method: 'POST', cookie: adminCookie, body: { store, lastBackupAt: null } });
if (imported.status !== 200) throw new Error(`import failed ${imported.status}`);

const loginA = await jfetch('/api/student/login', { method: 'POST', body: { code: 'CODEA1' } });
const loginB = await jfetch('/api/student/login', { method: 'POST', body: { code: 'CODEB1' } });
if (loginA.status !== 200 || loginB.status !== 200) throw new Error('student login failed');

const s1 = 'session-a';
const s2 = 'session-b';
const startAt = new Date().toISOString();
for (const [childId, sessionId] of [['child-a', s1], ['child-b', s2]]) {
  const started = await jfetch('/api/student/start', {
    method: 'POST',
    body: { childId, grade: 4, campaignId: '4А', sessionId, recommendation: '', startedAt: startAt, scores: [] },
  });
  if (started.status !== 200) throw new Error(`start failed ${childId}`);
}

const questionId = 'g4-i1';
const batteryId = 'intelligence_4';
const answeredAt = new Date().toISOString();
const answerBody = (choiceIndex) => ({
  questionId,
  batteryId,
  choiceIndex,
  isCorrect: choiceIndex === 0,
  answeredAt,
  currentQuestionIndex: 1,
  scores: [{ batteryId, rawScore: 1, scaledScore: 6, durationSec: 2, interpretation: 'ok', answered: 1, correct: choiceIndex === 0 ? 1 : 0 }],
  recommendation: 'ok',
  pauseEvents: [],
});

const dashboardDuring = jfetch('/api/admin/dashboard', { cookie: adminCookie });
const [ansA, ansB, dash] = await Promise.all([
  jfetch(`/api/session/${s1}/answer`, { method: 'POST', body: answerBody(0) }),
  jfetch(`/api/session/${s2}/answer`, { method: 'POST', body: answerBody(1) }),
  dashboardDuring,
]);

const sessionA = await jfetch(`/api/session/${s1}`);
const sessionB = await jfetch(`/api/session/${s2}`);

const result = {
  checks: {
    simultaneousAnswers: ansA.status === 200 && ansB.status === 200,
    adminDashboardOpen: dash.status === 200,
    noConflictBannerEquivalent: ![ansA.data?.error, ansB.data?.error, dash.data?.error].some(Boolean),
    buttonsResponsiveEquivalent: ansA.status === 200 && ansB.status === 200,
    noSessionInvalidation: sessionA.status === 200 && sessionB.status === 200
      && sessionA.data.session.status === 'active' && sessionB.data.session.status === 'active'
      && sessionA.data.session.answers.length === 1 && sessionB.data.session.answers.length === 1,
  },
  responses: { ansA: ansA.status, ansB: ansB.status, dashboard: dash.status, sessionA: sessionA.status, sessionB: sessionB.status },
  snapshots: {
    sessionAAnswers: sessionA.data?.session?.answers ?? [],
    sessionBAnswers: sessionB.data?.session?.answers ?? [],
    dashboardSessions: dash.data?.store?.sessions?.length,
  },
};

console.log(JSON.stringify(result, null, 2));
if (!Object.values(result.checks).every(Boolean)) process.exit(1);
