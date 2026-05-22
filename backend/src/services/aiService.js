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
    throw new Error('OPENAI_API_KEY is not configured. Add the key to the .env file');
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const truncatedText = text.length > MAX_TEXT_LENGTH ? text.substring(0, MAX_TEXT_LENGTH) : text;

  const typeNote =
    questionType === 'multiple'
      ? 'Some questions may have MULTIPLE correct answers.'
      : 'Each question has EXACTLY ONE correct answer.';

  let answerInstruction;
  if (docMode === 'with_answers') {
    answerInstruction = `The document CONTAINS correct answers — they may be marked with symbols (*, +, ✓, bold text, underline, a letter in parentheses, etc.).
Your task: find the marked answer, do NOT guess.
- If the answer is clearly marked → correct_answers = [index], confidence = 90–100
- If the marking is ambiguous → confidence = 50–79
- If no answer is found at all → correct_answers = [0], confidence = 0`;
  } else {
    answerInstruction = `The document does NOT contain correct answers — only questions and options.
Do NOT try to guess the correct answer.
For ALL questions set: correct_answers = [0], confidence = 0
The user will specify correct answers manually when editing the test.`;
  }

  const systemPrompt = `You are an assistant that extracts test questions from educational documents.

Rules:
- Do NOT translate the text
- Do NOT rephrase questions
- Do NOT alter answer options
- Preserve the original language of the document
- ${typeNote}
- If a question has no explicit answer options — generate 4 plausible options based on context

${answerInstruction}

Return ONLY a JSON array, no explanations:
[
  {
    "text": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answers": [0],
    "confidence": 95
  }
]`;

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Extract ALL questions:\n\n${truncatedText}` },
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
    if (!jsonMatch) throw new Error('AI did not return valid JSON with questions');
    parsed = JSON.parse(jsonMatch[0]);
  }

  const questions = Array.isArray(parsed)
    ? parsed
    : parsed.questions || parsed.items || Object.values(parsed)[0];

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('No questions found in the document');
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
    throw new Error('Could not extract any valid questions');
  }

  // In "without answers" mode all questions go directly to manual review
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
    throw new Error('OPENAI_API_KEY is not configured');
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const correct = correctAnswers.map((i) => `"${options[i]}"`).join(', ');

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: 'system',
        content:
          'You are a teacher. Give a brief explanation (2-4 sentences) of why the given answer is correct. Reply in the same language as the question. Do not repeat the question.',
      },
      {
        role: 'user',
        content: `Question: ${text}\n\nOptions:\n${options
          .map((o, i) => `${i + 1}. ${o}`)
          .join('\n')}\n\nCorrect answer: ${correct}\n\nExplain why this answer is correct.`,
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
