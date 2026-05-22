const OpenAI = require('openai');

const CONFIDENCE_THRESHOLD = 80;
const MAX_TEXT_LENGTH = 80000;
const MODEL = 'gpt-4.1-nano';

/**
 * docMode:
 *   'with_answers'  — документ содержит правильные ответы (тест-банк с ключами)
 *   'without_answers' — только вопросы и варианты, ответы не указаны
 */
async function extractQuestionsFromText(text, questionType = 'single', docMode = 'with_answers') {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Добавьте ключ в файл .env');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const truncatedText = text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) : text;

  const typeNote =
    questionType === 'multiple'
      ? 'Некоторые вопросы могут иметь НЕСКОЛЬКО правильных ответов.'
      : 'Каждый вопрос имеет РОВНО ОДИН правильный ответ.';

  let answerInstruction;
  if (docMode === 'with_answers') {
    answerInstruction = `В документе ЕСТЬ правильные ответы — они могут быть помечены символами (*, +, ✓, жирным шрифтом, подчёркиванием, буквой в скобках и т.п.).
Твоя задача: найти именно отмеченный ответ, НЕ угадывать.
- Если ответ явно помечен → correct_answers = [индекс], confidence = 90–100
- Если пометка неоднозначна → confidence = 50–79
- Если ответ не найден совсем → correct_answers = [0], confidence = 0`;
  } else {
    answerInstruction = `В документе НЕТ правильных ответов — только вопросы и варианты.
НЕ пытайся угадать правильный ответ.
Для ВСЕХ вопросов выставляй: correct_answers = [0], confidence = 0
Пользователь сам укажет правильные ответы при редактировании теста.`;
  }

  const systemPrompt = `Ты — ассистент по извлечению тестовых вопросов из учебных документов.

Правила:
- НЕ переводи текст
- НЕ переформулируй вопросы
- НЕ изменяй варианты ответов
- Сохраняй оригинальный язык документа
- ${typeNote}
- Если у вопроса нет явных вариантов — создай 4 правдоподобных варианта на основе контекста

${answerInstruction}

Верни ТОЛЬКО JSON-массив, без пояснений:
[
  {
    "text": "Текст вопроса",
    "options": ["Вариант А", "Вариант Б", "Вариант В", "Вариант Г"],
    "correct_answers": [0],
    "confidence": 95
  }
]`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Извлеки ВСЕ вопросы:\n\n${truncatedText}` },
    ],
    response_format: { type: 'json_object' },
    temperature: docMode === 'with_answers' ? 0.1 : 0.0,
  });

  const responseText = response.choices[0].message.content || '';

  let parsed;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('ИИ не вернул корректный JSON с вопросами');
    parsed = JSON.parse(jsonMatch[0]);
  }

  const questions = Array.isArray(parsed)
    ? parsed
    : parsed.questions || parsed.items || Object.values(parsed)[0];

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('Вопросы не найдены в документе');
  }

  const valid = questions
    .filter((q) => q.text && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      text: String(q.text).trim(),
      options: q.options.map((o) => String(o).trim()),
      correct_answers: Array.isArray(q.correct_answers) ? q.correct_answers : [0],
      confidence: typeof q.confidence === 'number' ? q.confidence : 0,
    }));

  if (valid.length === 0) {
    throw new Error('Не удалось извлечь ни одного корректного вопроса');
  }

  // В режиме "без ответов" все вопросы сразу идут на ручную проверку
  if (docMode === 'without_answers') {
    return { confirmed: [], pending: valid, total: valid.length };
  }

  const confirmed = valid.filter((q) => q.confidence >= CONFIDENCE_THRESHOLD);
  const pending = valid.filter((q) => q.confidence < CONFIDENCE_THRESHOLD);

  const usage = response.usage
    ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens,
      }
    : null;

  return { confirmed, pending, total: valid.length, usage };
}

async function explainQuestion(text, options, correctAnswers) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен');
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const correct = correctAnswers.map((i) => `"${options[i]}"`).join(', ');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Ты — преподаватель. Дай краткое объяснение (2-4 предложения) почему указанный ответ является правильным. Отвечай на языке вопроса. Не повторяй вопрос.',
      },
      {
        role: 'user',
        content: `Вопрос: ${text}\n\nВарианты:\n${options
          .map((o, i) => `${i + 1}. ${o}`)
          .join('\n')}\n\nПравильный ответ: ${correct}\n\nОбъясни почему этот ответ правильный.`,
      },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });

  return response.choices[0].message.content.trim();
}

async function extractUniqueQuestions(files) {
  function normalizeText(t) {
    return t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  }

  const fileResults = [];
  for (const file of files) {
    const extracted = await extractQuestionsFromText(file.text, 'single', 'with_answers');
    const all = [...extracted.confirmed, ...extracted.pending];
    fileResults.push({ name: file.name, questions: all });
  }

  // Deduplicate across all files by normalized question text
  const seen = new Map();
  const uniqueQuestions = [];

  for (const file of fileResults) {
    for (const q of file.questions) {
      const key = normalizeText(q.text);
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueQuestions.push({ ...q, source: file.name });
      }
    }
  }

  const totalAcrossFiles = fileResults.reduce((sum, f) => sum + f.questions.length, 0);

  return {
    files: fileResults.map((f) => ({ name: f.name, count: f.questions.length })),
    unique_questions: uniqueQuestions,
    unique_count: uniqueQuestions.length,
    total_count: totalAcrossFiles,
    duplicate_count: totalAcrossFiles - uniqueQuestions.length,
  };
}

module.exports = { extractQuestionsFromText, explainQuestion, extractUniqueQuestions, CONFIDENCE_THRESHOLD };
