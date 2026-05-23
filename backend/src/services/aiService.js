const OpenAI = require('openai');

const CONFIDENCE_THRESHOLD = 80;
const MAX_TEXT_LENGTH = 80000;
const MODEL = 'gpt-4.1-nano';             // extraction + explain
const MODEL_ADVANCED = 'gpt-4.1';        // answer-finding for without_answers mode
const ANSWER_BATCH_SIZE = 10;

/**
 * docMode:
 *   'with_answers'    — document contains correct answers (marked with *, +, ✓, etc.)
 *   'without_answers' — only questions + options, no answers marked
 *                       Phase 1: nano extracts questions
 *                       Phase 2: gpt-4.1 finds answers in batches of 10
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

  // ── PHASE 1: extract questions ──────────────────────────────────────────────
  const phase1System = `You are an assistant that extracts test questions from educational documents.

Rules:
- Do NOT translate the text
- Do NOT rephrase questions or answer options
- Preserve the original language of the document
- ${typeNote}
- If a question has no explicit answer options — generate 4 plausible options based on context
${
  docMode === 'with_answers'
    ? `
The document CONTAINS correct answers — they may be marked with symbols (*, +, ✓, bold text, underline, a letter in parentheses, etc.).
Your task: find the marked answer, do NOT guess.
- If the answer is clearly marked → correct_answers = [index], confidence = 90–100
- If the marking is ambiguous → confidence = 50–79
- If no answer is found at all → correct_answers = [0], confidence = 0`
    : `
The document does NOT contain correct answers — only questions and options.
For ALL questions set: correct_answers = [0], confidence = 0
(Correct answers will be determined in a second pass by a smarter model.)`
}

Return ONLY a valid JSON object:
{ "questions": [
  {
    "text": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answers": [0],
    "confidence": 0
  }
]}`;

  const phase1Response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: phase1System },
      { role: 'user', content: `Extract ALL questions from the document:\n\n${truncatedText}` },
    ],
    response_format: { type: 'json_object' },
    temperature: docMode === 'with_answers' ? 0.1 : 0.0,
  });

  const phase1Text = phase1Response.choices[0].message.content || '';
  let parsed;
  try {
    parsed = JSON.parse(phase1Text);
  } catch {
    const jsonMatch = phase1Text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('AI did not return valid JSON with questions');
    parsed = JSON.parse(jsonMatch[0]);
  }

  const rawQuestions = Array.isArray(parsed)
    ? parsed
    : parsed.questions || parsed.items || Object.values(parsed)[0];

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('No questions found in the document');
  }

  const extracted = rawQuestions
    .filter((q) => q.text && Array.isArray(q.options) && q.options.length >= 2)
    .map((q) => ({
      text: String(q.text).trim(),
      options: q.options.map((o) => String(o).trim()),
      correct_answers: Array.isArray(q.correct_answers) ? q.correct_answers : [0],
      confidence: typeof q.confidence === 'number' ? q.confidence : 0,
    }));

  if (extracted.length === 0) {
    throw new Error('Could not extract any valid questions');
  }

  // Track total token usage across all calls
  let totalUsage = {
    prompt_tokens: phase1Response.usage?.prompt_tokens || 0,
    completion_tokens: phase1Response.usage?.completion_tokens || 0,
    total_tokens: phase1Response.usage?.total_tokens || 0,
  };

  // ── with_answers mode: done after phase 1 ──────────────────────────────────
  if (docMode === 'with_answers') {
    const confirmed = extracted.filter((q) => q.confidence >= CONFIDENCE_THRESHOLD);
    const pending   = extracted.filter((q) => q.confidence < CONFIDENCE_THRESHOLD);
    return { confirmed, pending, total: extracted.length, usage: totalUsage };
  }

  // ── PHASE 2 (without_answers): find answers with advanced model ─────────────
  const phase2System = `You are an expert educator who knows the correct answers to academic test questions.
${typeNote}

For each question given, determine the correct answer(s) based on your knowledge.
Be as accurate as possible — this is academic material.

Return ONLY a valid JSON object:
{ "answers": [
  { "correct_answers": [0], "confidence": 85 }
]}

- correct_answers: 0-based indices of the correct option(s)
- confidence: 0–100 (your certainty that the answer is correct)`;

  const answeredQuestions = [...extracted]; // will mutate confidence + correct_answers

  for (let batchStart = 0; batchStart < extracted.length; batchStart += ANSWER_BATCH_SIZE) {
    const batch = extracted.slice(batchStart, batchStart + ANSWER_BATCH_SIZE);

    const questionsText = batch
      .map((q, i) =>
        `Question ${batchStart + i + 1}:\n${q.text}\n` +
        q.options.map((opt, oi) => `  ${oi}. ${opt}`).join('\n')
      )
      .join('\n\n');

    let batchResponse;
    try {
      batchResponse = await client.chat.completions.create({
        model: MODEL_ADVANCED,
        messages: [
          { role: 'system', content: phase2System },
          { role: 'user', content: questionsText },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.0,
      });
    } catch (err) {
      // If the advanced model call fails, keep confidence = 0 for this batch
      console.error(`[aiService] Phase 2 batch ${batchStart}–${batchStart + batch.length} failed:`, err.message);
      continue;
    }

    // Accumulate token usage
    if (batchResponse.usage) {
      totalUsage.prompt_tokens     += batchResponse.usage.prompt_tokens;
      totalUsage.completion_tokens += batchResponse.usage.completion_tokens;
      totalUsage.total_tokens      += batchResponse.usage.total_tokens;
    }

    const batchText = batchResponse.choices[0].message.content || '';
    let batchParsed;
    try {
      batchParsed = JSON.parse(batchText);
    } catch {
      const jsonMatch = batchText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) continue;
      batchParsed = JSON.parse(jsonMatch[0]);
    }

    const answers = Array.isArray(batchParsed)
      ? batchParsed
      : batchParsed.answers || Object.values(batchParsed)[0];

    if (!Array.isArray(answers)) continue;

    answers.forEach((ans, localIdx) => {
      const globalIdx = batchStart + localIdx;
      if (globalIdx >= answeredQuestions.length) return;
      if (Array.isArray(ans.correct_answers) && ans.correct_answers.length > 0) {
        answeredQuestions[globalIdx].correct_answers = ans.correct_answers;
      }
      if (typeof ans.confidence === 'number') {
        answeredQuestions[globalIdx].confidence = ans.confidence;
      }
    });
  }

  // Split by confidence threshold
  const confirmed = answeredQuestions.filter((q) => q.confidence >= CONFIDENCE_THRESHOLD);
  const pending   = answeredQuestions.filter((q) => q.confidence < CONFIDENCE_THRESHOLD);

  return { confirmed, pending, total: answeredQuestions.length, usage: totalUsage };
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
