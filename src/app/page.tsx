"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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

type Store = {
  children: Child[];
  campaigns: Campaign[];
  sessions: Session[];
};

type Question = {
  id: string;
  batteryId: string;
  prompt: string;
  options: string[];
  correctIndex: number;
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

function normalizeClassGroup(value: unknown, fallbackGrade: Grade): ClassGroup {
  if (typeof value === "string" && CLASS_GROUPS.includes(value as ClassGroup)) {
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

const QUESTION_SETS: Record<Grade, Question[]> = {
  4: [
    {
      id: "g4-i1",
      batteryId: "intelligence_4",
      prompt: "Какой фрагмент завершает узор: круг, квадрат, круг, квадрат, ...?",
      options: ["круг", "треугольник", "звезда", "овал"],
      correctIndex: 0,
    },
    {
      id: "g4-i2",
      batteryId: "intelligence_4",
      prompt: "В матрице фигуры увеличиваются по числу углов: 3, 4, 5, ?. Что дальше?",
      options: ["круг", "шестиугольник", "квадрат", "пятиугольник"],
      correctIndex: 1,
    },
    {
      id: "g4-i3",
      batteryId: "intelligence_4",
      prompt: "Какой рисунок должен быть вместо пропуска: ▲ ▼ ▲ ▼ ...?",
      options: ["▲", "■", "●", "→"],
      correctIndex: 0,
    },
    {
      id: "g4-i4",
      batteryId: "intelligence_4",
      prompt: "Если фигура поворачивается на четверть круга каждый шаг, где она окажется на 4-м шаге?",
      options: ["слева", "в исходном положении", "вверх ногами", "справа"],
      correctIndex: 1,
    },
    {
      id: "g4-i5",
      batteryId: "intelligence_4",
      prompt: "Какой элемент лишний: ⚪, ⚪, ⚪, 🔺?",
      options: ["первый", "второй", "третий", "четвёртый"],
      correctIndex: 3,
    },
    {
      id: "g4-i6",
      batteryId: "intelligence_4",
      prompt: "Продолжи узор: 1 точка, 2 точки, 3 точки, ...",
      options: ["2 точки", "3 точки", "4 точки", "5 точек"],
      correctIndex: 2,
    },
    {
      id: "g4-i7",
      batteryId: "intelligence_4",
      prompt: "Если квадрат разделён на 4 части и убрали одну, сколько частей осталось?",
      options: ["1", "2", "3", "4"],
      correctIndex: 2,
    },
    {
      id: "g4-i8",
      batteryId: "intelligence_4",
      prompt: "В ряду фигур: круг, треугольник, квадрат, круг, треугольник, ... что дальше?",
      options: ["круг", "квадрат", "ромб", "звезда"],
      correctIndex: 1,
    },
    {
      id: "g4-i9",
      batteryId: "intelligence_4",
      prompt: "В таблице 2x2 все стрелки смотрят вправо, кроме одной. Какая должна быть в пропуске, чтобы правило сохранилось?",
      options: ["вправо", "влево", "вверх", "вниз"],
      correctIndex: 0,
    },
    {
      id: "g4-i10",
      batteryId: "intelligence_4",
      prompt: "Продолжи ряд фигур: ○, □, ○, □, ...",
      options: ["○", "△", "☆", "⬟"],
      correctIndex: 0,
    },
    {
      id: "g4-i11",
      batteryId: "intelligence_4",
      prompt: "Какое число пропущено: 2, 4, 6, ..., 10?",
      options: ["7", "8", "9", "11"],
      correctIndex: 1,
    },
    {
      id: "g4-i12",
      batteryId: "intelligence_4",
      prompt: "Если стрелка была вверх и повернулась вправо, куда она смотрит?",
      options: ["вверх", "влево", "вправо", "вниз"],
      correctIndex: 2,
    },
    {
      id: "g4-i13",
      batteryId: "intelligence_4",
      prompt: "Что лишнее: 3, 6, 9, 10?",
      options: ["3", "6", "9", "10"],
      correctIndex: 3,
    },
    {
      id: "g4-i14",
      batteryId: "intelligence_4",
      prompt: "Какой узор повторяется: 🔵🔴🔵🔴 ... ?",
      options: ["🔵", "🟢", "🟡", "⚫"],
      correctIndex: 0,
    },
    {
      id: "g4-i15",
      batteryId: "intelligence_4",
      prompt: "Сколько сторон у фигуры после треугольника по порядку 3, 4, 5, ...?",
      options: ["4", "5", "6", "7"],
      correctIndex: 2,
    },
    {
      id: "g4-l1",
      batteryId: "logic_4",
      prompt: "Найди лишнее: яблоко, груша, слива, стул.",
      options: ["яблоко", "груша", "слива", "стул"],
      correctIndex: 3,
    },
    {
      id: "g4-l2",
      batteryId: "logic_4",
      prompt: "Заверши порядок: понедельник, вторник, среда, ...",
      options: ["пятница", "четверг", "суббота", "воскресенье"],
      correctIndex: 1,
    },
    {
      id: "g4-l3",
      batteryId: "logic_4",
      prompt: "Аналогия: котёнок относится к кошке так же, как щенок к ...",
      options: ["собаке", "корове", "кошке", "лисе"],
      correctIndex: 0,
    },
    {
      id: "g4-l4",
      batteryId: "logic_4",
      prompt: "Все карандаши — предметы для письма. Синий предмет — карандаш. Что верно?",
      options: ["Синий предмет — игрушка", "Синий предмет — для письма", "Синий предмет — книга", "Ничего нельзя сказать"],
      correctIndex: 1,
    },
    {
      id: "g4-l5",
      batteryId: "logic_4",
      prompt: "Если А больше Б, а Б больше В, кто самый маленький?",
      options: ["А", "Б", "В", "Определить нельзя"],
      correctIndex: 2,
    },
    {
      id: "g4-l6",
      batteryId: "logic_4",
      prompt: "Какое правило лучше подходит: 2, 4, 8, 16, ...",
      options: ["прибавить 2", "умножить на 2", "умножить на 3", "вычесть 2"],
      correctIndex: 1,
    },
    {
      id: "g4-l7",
      batteryId: "logic_4",
      prompt: "Сначала идёт маленький, потом средний, потом большой. Какой следующий, если порядок повторяется?",
      options: ["большой", "средний", "маленький", "любой"],
      correctIndex: 2,
    },
    {
      id: "g4-l8",
      batteryId: "logic_4",
      prompt: "Если дождь идёт, улица мокрая. Улица мокрая. Что точно можно сказать?",
      options: ["Точно был дождь", "Мокрая улица может быть и по другой причине", "Дождя не было", "Улица сухая"],
      correctIndex: 1,
    },
    {
      id: "g4-l9",
      batteryId: "logic_4",
      prompt: "Книга : читать = мяч : ...",
      options: ["бежать", "играть", "рисовать", "прыгать"],
      correctIndex: 1,
    },
    {
      id: "g4-l10",
      batteryId: "logic_4",
      prompt: "Все розы — цветы. Этот предмет — роза. Что верно?",
      options: ["Это дерево", "Это цветок", "Это фрукт", "Ничего нельзя сказать"],
      correctIndex: 1,
    },
    {
      id: "g4-l11",
      batteryId: "logic_4",
      prompt: "Если сегодня вторник, какой день будет через 2 дня?",
      options: ["среда", "четверг", "пятница", "суббота"],
      correctIndex: 1,
    },
    {
      id: "g4-l12",
      batteryId: "logic_4",
      prompt: "Что общее у слов «стол», «стул», «шкаф»?",
      options: ["игрушки", "мебель", "овощи", "животные"],
      correctIndex: 1,
    },
    {
      id: "g4-l13",
      batteryId: "logic_4",
      prompt: "Если А выше Б, а Б выше В, кто выше всех?",
      options: ["А", "Б", "В", "Нельзя узнать"],
      correctIndex: 0,
    },
    {
      id: "g4-l14",
      batteryId: "logic_4",
      prompt: "Продолжи правило: красный, синий, красный, синий, ...",
      options: ["зелёный", "жёлтый", "красный", "белый"],
      correctIndex: 2,
    },
    {
      id: "g4-l15",
      batteryId: "logic_4",
      prompt: "Если на улице снег, то холодно. Сейчас не холодно. Что верно?",
      options: ["Снег точно идёт", "Снега нет", "Снег и дождь вместе", "Ничего нельзя сказать"],
      correctIndex: 1,
    },
    {
      id: "g4-m1",
      batteryId: "math_aptitude_4",
      prompt: "Какое число ближе к 100: 97 или 92?",
      options: ["97", "92", "одинаково", "нельзя сравнить"],
      correctIndex: 0,
    },
    {
      id: "g4-m2",
      batteryId: "math_aptitude_4",
      prompt: "Если 1 шоколадка стоит 20 рублей, сколько стоят 3 шоколадки?",
      options: ["40", "50", "60", "70"],
      correctIndex: 2,
    },
    {
      id: "g4-m3",
      batteryId: "math_aptitude_4",
      prompt: "Продолжи числовой узор: 5, 10, 15, ...",
      options: ["18", "20", "22", "25"],
      correctIndex: 1,
    },
    {
      id: "g4-m4",
      batteryId: "math_aptitude_4",
      prompt: "Что больше: 3/4 или 2/4?",
      options: ["3/4", "2/4", "равны", "сравнить нельзя"],
      correctIndex: 0,
    },
    {
      id: "g4-m5",
      batteryId: "math_aptitude_4",
      prompt: "У Пети 12 карандашей, у Оли на 4 меньше. Сколько у Оли?",
      options: ["6", "7", "8", "9"],
      correctIndex: 2,
    },
    {
      id: "g4-m6",
      batteryId: "math_aptitude_4",
      prompt: "Если фигуру повернуть на 180°, какой вариант совпадёт с исходным квадратом с диагональю?",
      options: ["тот же", "зеркальный", "перевёрнутый треугольник", "пустой"],
      correctIndex: 0,
    },
    {
      id: "g4-m7",
      batteryId: "math_aptitude_4",
      prompt: "Сравни 48 и 84.",
      options: ["48 > 84", "48 < 84", "48 = 84", "сравнить нельзя"],
      correctIndex: 1,
    },
    {
      id: "g4-m8",
      batteryId: "math_aptitude_4",
      prompt: "На рисунке 2 ряда по 5 кружков. Сколько всего кружков?",
      options: ["7", "8", "10", "12"],
      correctIndex: 2,
    },
    {
      id: "g4-m9",
      batteryId: "math_aptitude_4",
      prompt: "Какое число должно быть в пропуске: 2, 3, 5, 8, ...",
      options: ["10", "11", "12", "13"],
      correctIndex: 3,
    },
    {
      id: "g4-m10",
      batteryId: "math_aptitude_4",
      prompt: "Сколько будет: 9 + 6?",
      options: ["13", "14", "15", "16"],
      correctIndex: 2,
    },
    {
      id: "g4-m11",
      batteryId: "math_aptitude_4",
      prompt: "У Маши 5 яблок, дали ещё 4. Сколько стало?",
      options: ["8", "9", "10", "11"],
      correctIndex: 1,
    },
    {
      id: "g4-m12",
      batteryId: "math_aptitude_4",
      prompt: "Какое число больше: 56 или 65?",
      options: ["56", "65", "они равны", "сравнить нельзя"],
      correctIndex: 1,
    },
    {
      id: "g4-m13",
      batteryId: "math_aptitude_4",
      prompt: "Сколько минут в получасе?",
      options: ["20", "25", "30", "40"],
      correctIndex: 2,
    },
    {
      id: "g4-m14",
      batteryId: "math_aptitude_4",
      prompt: "Продолжи ряд: 4, 8, 12, ...",
      options: ["14", "15", "16", "18"],
      correctIndex: 2,
    },
    {
      id: "g4-m15",
      batteryId: "math_aptitude_4",
      prompt: "В коробке 10 карандашей. 3 взяли. Сколько осталось?",
      options: ["6", "7", "8", "9"],
      correctIndex: 1,
    },
  ],
  6: [
    {
      id: "g6-i1",
      batteryId: "intelligence_6",
      prompt: "Матрица: в каждой строке число углов увеличивается на 1. Какой элемент в пустой ячейке?",
      options: ["квадрат", "пятиугольник", "шестиугольник", "треугольник"],
      correctIndex: 2,
    },
    {
      id: "g6-i2",
      batteryId: "intelligence_6",
      prompt: "Фигура каждый шаг поворачивается на 90° и меняет цвет. Что будет на 4-м шаге?",
      options: ["исходная форма и цвет", "другой цвет", "зеркальная форма", "форма исчезнет"],
      correctIndex: 0,
    },
    {
      id: "g6-i3",
      batteryId: "intelligence_6",
      prompt: "Последовательность символов obeys rule AB, BAA, ABBB, ?. Выбери следующий элемент.",
      options: ["ABBBB", "AAABBB", "ABBBBB", "BAAAA"],
      correctIndex: 2,
    },
    {
      id: "g6-i4",
      batteryId: "intelligence_6",
      prompt: "Если к каждой фигуре применяют два правила: поворот и сдвиг вправо, где окажется итоговая фигура?",
      options: ["в левом верхнем углу", "в правом верхнем углу", "в центре", "в левом нижнем углу"],
      correctIndex: 1,
    },
    {
      id: "g6-i5",
      batteryId: "intelligence_6",
      prompt: "Найди элемент, нарушающий двухуровневый паттерн: чётность + форма.",
      options: ["2▲", "4▲", "6■", "8▲"],
      correctIndex: 2,
    },
    {
      id: "g6-i6",
      batteryId: "intelligence_6",
      prompt: "Если 1-й столбец увеличивает число на 2, а 2-й умножает на 2, чему равен выход для 5?",
      options: ["12", "14", "16", "20"],
      correctIndex: 2,
    },
    {
      id: "g6-i7",
      batteryId: "intelligence_6",
      prompt: "Какой вариант завершает матрицу, где по диагонали чередуются типы преобразований?",
      options: ["зеркало", "поворот", "масштаб", "комбинация поворота и зеркала"],
      correctIndex: 3,
    },
    {
      id: "g6-i8",
      batteryId: "intelligence_6",
      prompt: "В последовательности 3, 6, 12, 24 применяется один и тот же оператор. Какой следующий элемент?",
      options: ["30", "36", "42", "48"],
      correctIndex: 3,
    },
    {
      id: "g6-i9",
      batteryId: "intelligence_6",
      prompt: "Условие: фигуры с нечётным числом сторон затемняются, с чётным — светлые. Какая фигура должна быть тёмной?",
      options: ["квадрат", "шестиугольник", "пятиугольник", "восьмиугольник"],
      correctIndex: 2,
    },
    {
      id: "g6-i10",
      batteryId: "intelligence_6",
      prompt: "Какой ответ сохраняет оба правила одновременно: порядок символов и направление стрелки?",
      options: ["A→B", "B→A", "A←B", "B←A"],
      correctIndex: 3,
    },
    {
      id: "g6-i11",
      batteryId: "intelligence_6",
      prompt: "Матрица преобразований: каждая строка увеличивает число сторон на 1 и инвертирует цвет. Что в пустой ячейке?",
      options: ["белый пятиугольник", "чёрный пятиугольник", "белый шестиугольник", "чёрный шестиугольник"],
      correctIndex: 1,
    },
    {
      id: "g6-i12",
      batteryId: "intelligence_6",
      prompt: "Последовательность задаётся правилом f(n+1)=2f(n)-1, f(1)=3. Найди f(4).",
      options: ["15", "17", "19", "21"],
      correctIndex: 2,
    },
    {
      id: "g6-i13",
      batteryId: "intelligence_6",
      prompt: "В коде символов каждая вторая буква сдвигается на 1 позицию в алфавите. Что получится из «КОТ»?",
      options: ["КПТ", "ЛОУ", "КПУ", "ЛПТ"],
      correctIndex: 0,
    },
    {
      id: "g6-i14",
      batteryId: "intelligence_6",
      prompt: "Если каждая фигура отражается по вертикали, затем поворачивается на 90° по часовой, какой тип преобразования эквивалентен?",
      options: ["поворот на 180°", "отражение по диагонали", "сдвиг вправо", "масштабирование"],
      correctIndex: 1,
    },
    {
      id: "g6-i15",
      batteryId: "intelligence_6",
      prompt: "Выбери элемент, который завершает ряд по двум признакам: рост числа и смена чётности цвета.",
      options: ["7 тёмный", "8 светлый", "9 тёмный", "10 светлый"],
      correctIndex: 2,
    },
    {
      id: "g6-i16",
      batteryId: "intelligence_6",
      prompt: "Если оператор ◇ означает «умножить на 3 и вычесть 2», чему равно 5◇?",
      options: ["11", "12", "13", "14"],
      correctIndex: 2,
    },
    {
      id: "g6-i17",
      batteryId: "intelligence_6",
      prompt: "В таблице координат точка смещается по правилу (+2; -1) каждый шаг. Где будет точка из (1;4) через 2 шага?",
      options: ["(3;3)", "(5;2)", "(5;3)", "(4;2)"],
      correctIndex: 1,
    },
    {
      id: "g6-i18",
      batteryId: "intelligence_6",
      prompt: "Найди закономерность: B2, D4, F6, ...",
      options: ["G7", "H8", "I9", "J10"],
      correctIndex: 1,
    },
    {
      id: "g6-i19",
      batteryId: "intelligence_6",
      prompt: "Если в системе кодирования «△=2, □=3», чему равно «△□△» как сумма символов?",
      options: ["6", "7", "8", "9"],
      correctIndex: 1,
    },
    {
      id: "g6-i20",
      batteryId: "intelligence_6",
      prompt: "Какой вариант поддерживает правило: каждая следующая строка — циклический сдвиг предыдущей на 1 вправо?",
      options: ["ABC → BCA", "ABC → CAB", "ABC → CBA", "ABC → ACB"],
      correctIndex: 1,
    },
    {
      id: "g6-l1",
      batteryId: "logic_6",
      prompt: "Если все M являются N, и ни один N не является P, что верно?",
      options: ["Некоторые M — это P", "Ни один M не является P", "Все P являются M", "Нельзя сделать вывод"],
      correctIndex: 1,
    },
    {
      id: "g6-l2",
      batteryId: "logic_6",
      prompt: "Если утверждение «Если идёт дождь, то матч отменят» истинно, а матч не отменили, что следует?",
      options: ["Дождь точно был", "Дождя не было", "Матч всё равно отменён", "Ничего нельзя вывести"],
      correctIndex: 1,
    },
    {
      id: "g6-l3",
      batteryId: "logic_6",
      prompt: "Выбери корректное следствие: «Некоторые A — B. Все B — C».",
      options: ["Некоторые A — C", "Все A — C", "Ни один A — C", "Все C — A"],
      correctIndex: 0,
    },
    {
      id: "g6-l4",
      batteryId: "logic_6",
      prompt: "Какая структура аргумента корректна?",
      options: ["Если X, то Y. Y, значит X", "Если X, то Y. Не Y, значит не X", "X или Y. X, значит Y", "Если X, то Y. X, значит не Y"],
      correctIndex: 1,
    },
    {
      id: "g6-l5",
      batteryId: "logic_6",
      prompt: "Определи противоречие: какое из утверждений не может быть истинным одновременно с остальными?",
      options: ["Все ученики пришли", "Некоторые ученики опоздали", "Ни один ученик не отсутствует", "Один ученик не пришёл"],
      correctIndex: 3,
    },
    {
      id: "g6-l6",
      batteryId: "logic_6",
      prompt: "Если A → B и B → C, какое отношение между A и C?",
      options: ["A → C", "C → A", "A ↔ C", "Связи нет"],
      correctIndex: 0,
    },
    {
      id: "g6-l7",
      batteryId: "logic_6",
      prompt: "Установи корректный вывод из посылок: «Либо K, либо L. Не K».",
      options: ["Не L", "L", "K", "Ни K, ни L"],
      correctIndex: 1,
    },
    {
      id: "g6-l8",
      batteryId: "logic_6",
      prompt: "Какой вывод валиден при кванторах: «Все R — S. Некоторые S — T»?",
      options: ["Все R — T", "Некоторые T — R", "R и T могут не пересекаться", "Ни один R — S"],
      correctIndex: 2,
    },
    {
      id: "g6-l9",
      batteryId: "logic_6",
      prompt: "Какой аргумент имеет форму обобщения по одному примеру (и потому слаб)?",
      options: ["Один ученик любит геометрию, значит все любят геометрию", "Все чётные делятся на 2", "Если лёд нагреть, он тает", "Треугольник имеет три стороны"],
      correctIndex: 0,
    },
    {
      id: "g6-l10",
      batteryId: "logic_6",
      prompt: "Какое утверждение является необходимым условием: «Чтобы сдать зачёт, нужно решить все базовые задачи»?",
      options: ["Если решены все базовые задачи, зачёт гарантирован", "Без решения всех базовых задач зачёт невозможен", "Зачёт не зависит от задач", "Решить можно только сложные задачи"],
      correctIndex: 1,
    },
    {
      id: "g6-l11",
      batteryId: "logic_6",
      prompt: "Из посылок «Все A — B» и «Некоторые C — A» следует, что:",
      options: ["Некоторые C — B", "Все C — B", "Ни один C — B", "Вывода нет"],
      correctIndex: 0,
    },
    {
      id: "g6-l12",
      batteryId: "logic_6",
      prompt: "Какой вывод корректен: «Если P, то Q. Если Q, то R. P»?",
      options: ["Не R", "R", "Не Q", "Q и не R"],
      correctIndex: 1,
    },
    {
      id: "g6-l13",
      batteryId: "logic_6",
      prompt: "Определи логическую ошибку: «После того как ученик взял талисман, он получил пятёрку, значит талисман приносит пятёрки».",
      options: ["Подмена тезиса", "Ложная причина", "Круг в доказательстве", "Ложная дилемма"],
      correctIndex: 1,
    },
    {
      id: "g6-l14",
      batteryId: "logic_6",
      prompt: "Если верно «Либо X, либо Y», и дополнительно известно «Y ложно», что следует?",
      options: ["X ложно", "X истинно", "Ничего", "X и Y истинны"],
      correctIndex: 1,
    },
    {
      id: "g6-l15",
      batteryId: "logic_6",
      prompt: "Какая из формулировок эквивалентна «Не (A и B)»?",
      options: ["Не A и не B", "Не A или не B", "A или B", "A и не B"],
      correctIndex: 1,
    },
    {
      id: "g6-l16",
      batteryId: "logic_6",
      prompt: "Из утверждения «Все олимпиадники решают задачи» НЕ следует, что:",
      options: ["Некоторые решающие задачи — олимпиадники", "Если человек не решает задачи, он не олимпиадник", "Каждый олимпиадник решает задачи", "Существуют решающие задачи люди"],
      correctIndex: 3,
    },
    {
      id: "g6-l17",
      batteryId: "logic_6",
      prompt: "Что является контрпримером к тезису «Все простые числа нечётные»?",
      options: ["1", "2", "3", "5"],
      correctIndex: 1,
    },
    {
      id: "g6-l18",
      batteryId: "logic_6",
      prompt: "Если «Некоторые M — N» истинно, какое утверждение обязательно истинно?",
      options: ["Все M — N", "Некоторые N — M", "Ни один M — N", "Все N — M"],
      correctIndex: 1,
    },
    {
      id: "g6-l19",
      batteryId: "logic_6",
      prompt: "Какой вывод корректен: «Не верно, что все задачи лёгкие»?",
      options: ["Все задачи трудные", "Некоторые задачи не лёгкие", "Ни одна задача не лёгкая", "Есть ровно одна трудная задача"],
      correctIndex: 1,
    },
    {
      id: "g6-l20",
      batteryId: "logic_6",
      prompt: "Какая схема рассуждения корректна?",
      options: ["Если A, то B. B. Значит A", "Если A, то B. Не A. Значит не B", "Если A, то B. A. Значит B", "A или B. B. Значит не A"],
      correctIndex: 2,
    },
    {
      id: "g6-m1",
      batteryId: "math_aptitude_6",
      prompt: "Продолжи структуру: 2, 6, 12, 20, ...",
      options: ["28", "30", "32", "36"],
      correctIndex: 1,
    },
    {
      id: "g6-m2",
      batteryId: "math_aptitude_6",
      prompt: "На весах: слева 2 одинаковых куба и гиря 3 кг, справа 11 кг. Сколько весит куб?",
      options: ["3 кг", "4 кг", "5 кг", "6 кг"],
      correctIndex: 1,
    },
    {
      id: "g6-m3",
      batteryId: "math_aptitude_6",
      prompt: "Сколько разных пар можно составить из 5 учеников?",
      options: ["5", "8", "10", "20"],
      correctIndex: 2,
    },
    {
      id: "g6-m4",
      batteryId: "math_aptitude_6",
      prompt: "Если скорость увеличили с 40 до 60 км/ч, во сколько раз она выросла?",
      options: ["в 1.2 раза", "в 1.5 раза", "в 2 раза", "в 2.5 раза"],
      correctIndex: 1,
    },
    {
      id: "g6-m5",
      batteryId: "math_aptitude_6",
      prompt: "Какое выражение моделирует стоимость x тетрадей по 18 рублей и одного альбома за 70 рублей?",
      options: ["18 + 70x", "18x + 70", "70x + 18", "18x - 70"],
      correctIndex: 1,
    },
    {
      id: "g6-m6",
      batteryId: "math_aptitude_6",
      prompt: "Числовой паттерн задаётся правилом n² - 1. Чему равно значение при n=6?",
      options: ["33", "35", "36", "37"],
      correctIndex: 1,
    },
    {
      id: "g6-m7",
      batteryId: "math_aptitude_6",
      prompt: "Если 3 ручки стоят столько же, сколько 2 блокнота, а ручка = 12 рублей, сколько стоит блокнот?",
      options: ["12", "16", "18", "20"],
      correctIndex: 2,
    },
    {
      id: "g6-m8",
      batteryId: "math_aptitude_6",
      prompt: "В последовательности фигур каждая следующая добавляет 3 элемента. Было 4, затем 7, затем 10. Что дальше?",
      options: ["11", "12", "13", "14"],
      correctIndex: 2,
    },
    {
      id: "g6-m9",
      batteryId: "math_aptitude_6",
      prompt: "Сколько способов выбрать капитана и заместителя из 4 человек?",
      options: ["6", "8", "10", "12"],
      correctIndex: 3,
    },
    {
      id: "g6-m10",
      batteryId: "math_aptitude_6",
      prompt: "Какое значение лучше всего продолжает обобщение: 1, 4, 9, 16, ...",
      options: ["20", "24", "25", "27"],
      correctIndex: 2,
    },
    {
      id: "g6-m11",
      batteryId: "math_aptitude_6",
      prompt: "Реши уравнение: 3x + 5 = 26.",
      options: ["6", "7", "8", "9"],
      correctIndex: 1,
    },
    {
      id: "g6-m12",
      batteryId: "math_aptitude_6",
      prompt: "Найди значение выражения: 2² + 3² + 4².",
      options: ["25", "27", "29", "31"],
      correctIndex: 2,
    },
    {
      id: "g6-m13",
      batteryId: "math_aptitude_6",
      prompt: "В классе 24 ученика. 3/8 класса участвуют в кружке. Сколько это учеников?",
      options: ["6", "8", "9", "12"],
      correctIndex: 2,
    },
    {
      id: "g6-m14",
      batteryId: "math_aptitude_6",
      prompt: "Поезд прошёл 180 км за 3 часа. Какова средняя скорость?",
      options: ["50 км/ч", "55 км/ч", "60 км/ч", "65 км/ч"],
      correctIndex: 2,
    },
    {
      id: "g6-m15",
      batteryId: "math_aptitude_6",
      prompt: "Если периметр квадрата 36 см, чему равна его площадь?",
      options: ["64 см²", "72 см²", "81 см²", "96 см²"],
      correctIndex: 2,
    },
    {
      id: "g6-m16",
      batteryId: "math_aptitude_6",
      prompt: "Сколько процентов составляет 15 от 60?",
      options: ["20%", "25%", "30%", "35%"],
      correctIndex: 1,
    },
    {
      id: "g6-m17",
      batteryId: "math_aptitude_6",
      prompt: "Найди следующий член арифметической прогрессии: 7, 11, 15, ...",
      options: ["17", "18", "19", "20"],
      correctIndex: 2,
    },
    {
      id: "g6-m18",
      batteryId: "math_aptitude_6",
      prompt: "Сколько диагоналей у пятиугольника?",
      options: ["4", "5", "6", "7"],
      correctIndex: 1,
    },
    {
      id: "g6-m19",
      batteryId: "math_aptitude_6",
      prompt: "На сколько процентов число 80 больше числа 50?",
      options: ["40%", "50%", "60%", "80%"],
      correctIndex: 2,
    },
    {
      id: "g6-m20",
      batteryId: "math_aptitude_6",
      prompt: "Если a = 3 и b = 5, чему равно 2a + 3b?",
      options: ["19", "21", "23", "25"],
      correctIndex: 1,
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

function interpretationFromScaled(scaled: number): string {
  if (scaled >= 8) return "Высокий уровень по домену.";
  if (scaled >= 5) return "Базовый/достаточный уровень по домену.";
  return "Требуется поддержка и развитие навыка.";
}

function computeScoresFromAnswers(grade: Grade, answers: SessionAnswer[], startedAt: string): SessionScore[] {
  const batteries = BATTERIES[grade];

  return batteries.map((battery, batteryIndex) => {
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
      interpretation: interpretationFromScaled(scaledScore),
      answered: answered.length,
      correct,
    };
  });
}

function computeRecommendation(grade: Grade, scores: SessionScore[]): string {
  const relevant = BATTERIES[grade];
  const scaled = relevant.map((b) => scores.find((s) => s.batteryId === b.id)?.scaledScore ?? 1);
  const avg = scaled.reduce((acc, value) => acc + value, 0) / scaled.length;
  if (avg >= 8) return "Рекомендован расширенный профиль и углублённые задания.";
  if (avg >= 5) return "Рекомендован базовый профиль с плановой поддержкой.";
  return "Рекомендована поддерживающая программа и индивидуальное сопровождение.";
}

function normalizeAnswers(grade: Grade, answers: Session["answers"]): SessionAnswer[] {
  const gradeQuestions = QUESTION_SETS[grade];
  return (answers ?? []).map((answer, index) => {
    const question = gradeQuestions.find((item) => item.id === answer.questionId);
    return {
      ...answer,
      batteryId: answer.batteryId || question?.batteryId || BATTERIES[grade][0].id,
      answeredAt: answer.answeredAt || new Date(Date.now() + index * 1000).toISOString(),
    };
  });
}

function normalizeStore(raw: Store): Store {
  const legacyCampaignMap = new Map((raw.campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const normalizedChildren: Child[] = (raw.children ?? []).map((child) => {
    const fallbackGrade = child.grade === 6 ? 6 : 4;
    const classGroup = normalizeClassGroup((child as Partial<Child>).classGroup, fallbackGrade);
    return { ...child, grade: gradeFromClassGroup(classGroup), classGroup };
  });
  const childById = new Map(normalizedChildren.map((child) => [child.id, child]));

  const sessions = (raw.sessions ?? []).map((session) => {
    const child = childById.get(session.childId);
    const fallbackGrade = child?.grade ?? session.grade ?? 4;
    const campaignGroupFromLegacy = legacyCampaignMap.get(session.campaignId)?.title;
    const classGroup = normalizeClassGroup(session.campaignId || campaignGroupFromLegacy, fallbackGrade);
    const resolvedGrade = child?.grade ?? gradeFromClassGroup(classGroup);
    const normalizedAnswers = normalizeAnswers(resolvedGrade, session.answers ?? []);
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

type AccessCodeStatus = "Выдан" | "Активен" | "Использован" | "Завершён" | "Переоткрыт" | "Сброшен";

function maskAccessCode(code: string): string {
  if (code.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, code.length - 4))}${code.slice(-4)}`;
}

function accessCodeStatus(child: Child, sessions: Session[]): AccessCodeStatus {
  const childSessions = sessions.filter((session) => session.childId === child.id);
  if (!childSessions.length) return "Выдан";

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

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...store, campaigns: FIXED_CAMPAIGNS }));
  }, [store]);

  const childrenByCode = useMemo(() => new Map(store.children.map((child) => [child.accessCode, child])), [store.children]);
  const loggedChild = loggedChildId ? store.children.find((child) => child.id === loggedChildId) : null;

  const childSessions = useMemo(
    () => (loggedChild ? store.sessions.filter((session) => session.childId === loggedChild.id) : []),
    [loggedChild, store.sessions],
  );

  function show(type: "ok" | "error", text: string): void {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 2800);
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
    while (childrenByCode.has(code)) {
      code = createCode();
    }

    const child: Child = {
      id: uid("ch"),
      registryId: `ANON-${Date.now().toString(36).slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 4).toUpperCase()}`,
      grade: gradeFromClassGroup(childClassGroup),
      classGroup: childClassGroup,
      accessCode: code,
      createdAt: new Date().toISOString(),
    };

    setStore((prev) => ({ ...prev, campaigns: FIXED_CAMPAIGNS, children: [child, ...prev.children] }));
    show("ok", `Код доступа создан: ${code}`);
  }

  function loginChild(e: FormEvent): void {
    e.preventDefault();
    const normalizedCode = loginCode.trim().toUpperCase();
    const child = childrenByCode.get(normalizedCode);
    if (!child) {
      show("error", "Код не найден. Проверьте ввод.");
      return;
    }

    setRole("child");
    setLoggedChildId(child.id);
    setLoginCode("");
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
        session.status !== "completed" &&
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
    setStore((prev) => ({
      ...prev,
      sessions: prev.sessions.map((session) => {
        if (session.id !== sessionId || session.status === "completed") return session;

        const questions = QUESTION_SETS[session.grade];
        const question = questions[session.currentQuestionIndex];
        if (!question) return session;

        const newAnswer: SessionAnswer = {
          questionId: question.id,
          batteryId: question.batteryId,
          choiceIndex: selectedIndex,
          isCorrect: selectedIndex === question.correctIndex,
          answeredAt: new Date().toISOString(),
        };

        const nextAnswers = [...session.answers, newAnswer];
        const nextScores = computeScoresFromAnswers(session.grade, nextAnswers, session.startedAt);

        return {
          ...session,
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

    if (!store.children.length) {
      show("error", "Нет кодов для экспорта.");
      return;
    }

    const rows = [
      ["registryId", "classGroup", "grade", "accessCode", "createdAt"],
      ...store.children.map((child) => [child.registryId, child.classGroup, child.grade.toString(), child.accessCode, child.createdAt]),
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

  const campaignSummary = FIXED_CAMPAIGNS.map((campaign) => {
    const items = store.sessions.filter((session) => session.campaignId === campaign.id && session.status === "completed");
    const recommendations = items.map((session) => session.adminOverride?.text || session.recommendation).filter(Boolean);
    return { campaign, done: items.length, recommendations };
  });

  const activeChildSession = loggedChild
    ? childSessions.find((session) => session.campaignId === loggedChild.classGroup && session.status !== "completed")
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
                    {store.children.map((child) => {
                      const status = accessCodeStatus(child, store.sessions);
                      const shouldMask = hasChildUsedCode.has(child.id) || status === "Завершён";
                      return (
                        <tr className="border-t border-slate-700" key={child.id}>
                          <td className="p-2">{child.registryId}</td>
                          <td className="p-2">{child.classGroup}</td>
                          <td className="p-2 font-mono text-sky-300">{shouldMask ? maskAccessCode(child.accessCode) : child.accessCode}</td>
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
              <h2 className="mb-3 text-lg font-semibold text-white">Завершенные сессии и ручная проверка</h2>
              <ul className="space-y-3">
                {completedSessions.map((session) => {
                  const child = store.children.find((item) => item.id === session.childId);
                  const recommendation = session.adminOverride?.text || session.recommendation;

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
              <h2 className="mb-3 text-lg font-semibold text-white">Итоговые рекомендации по классам</h2>
              <ul className="space-y-3 text-sm">
                {campaignSummary.map((item) => (
                  <li key={item.campaign.id} className="rounded-md border border-slate-700 bg-slate-900 p-2">
                    <p className="font-medium text-slate-100">{item.campaign.title} — завершено: {item.done}</p>
                    <ul className="list-disc pl-5 text-slate-200">
                      {item.recommendations.length ? item.recommendations.map((text, index) => <li key={`${item.campaign.id}-${index}`}>{text}</li>) : <li>Рекомендаций пока нет.</li>}
                    </ul>
                  </li>
                ))}
              </ul>
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
                              className="w-full rounded-md border border-slate-500 bg-slate-900 px-3 py-2 text-left text-slate-100 hover:border-sky-400 hover:bg-slate-700"
                              onClick={() => answerQuestion(activeChildSession.id, idx)}
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
