const express = require('express');
const { explainQuestion, askAboutQuestion, translateText } = require('../services/aiService');
const { optionalAuth } = require('../middleware/auth');
const { getDB } = require('../db/init');

const router = express.Router();

// POST /api/ai/explain — generate explanation for a question
router.post('/explain', optionalAuth, async (req, res) => {
  const { text, options, correct_answers } = req.body;

  if (!text || !Array.isArray(options) || !Array.isArray(correct_answers)) {
    return res.status(400).json({ error: 'Неверные данные вопроса' });
  }

  try {
    const explanation = await explainQuestion(text, options, correct_answers);

    try {
      const db = getDB();
      const action = req.user ? 'explain.request' : 'anon_explain_ai';
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (?, ?, ?, ?)`
      ).run(
        req.user ? req.user.id : null,
        action,
        JSON.stringify({ question: String(text).substring(0, 120) }),
        req.ip
      );
    } catch { /* logging failure must not break the response */ }

    res.json({ explanation });
  } catch (err) {
    console.error('Explain error:', err.message);
    res.status(500).json({ error: 'Не удалось получить объяснение от ИИ' });
  }
});

// POST /api/ai/ask — user asks a custom question about a quiz question
router.post('/ask', optionalAuth, async (req, res) => {
  const { text, options, correct_answers, user_question } = req.body;

  if (!text || !Array.isArray(options) || !Array.isArray(correct_answers) || !user_question?.trim()) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  try {
    const answer = await askAboutQuestion(text, options, correct_answers, user_question.trim());

    try {
      const db = getDB();
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (?, ?, ?, ?)`
      ).run(
        req.user ? req.user.id : null,
        req.user ? 'question.ask' : 'anon_question_ask',
        JSON.stringify({
          question: String(text).substring(0, 120),
          user_question: String(user_question).substring(0, 120),
        }),
        req.ip
      );
    } catch { /* logging failure must not break the response */ }

    res.json({ answer });
  } catch (err) {
    console.error('Ask error:', err.message);
    res.status(500).json({ error: 'Не удалось получить ответ от ИИ' });
  }
});

// POST /api/ai/translate — translate explanation text
router.post('/translate', optionalAuth, async (req, res) => {
  const { text, lang } = req.body;

  if (!text || !lang) {
    return res.status(400).json({ error: 'Неверные данные' });
  }

  const validLangs = ['RU', 'KZ', 'EN'];
  if (!validLangs.includes(lang)) {
    return res.status(400).json({ error: 'Неподдерживаемый язык' });
  }

  try {
    const translated = await translateText(text, lang);

    try {
      const db = getDB();
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (?, ?, ?, ?)`
      ).run(
        req.user ? req.user.id : null,
        req.user ? 'translate.request' : 'anon_translate',
        JSON.stringify({ lang }),
        req.ip
      );
    } catch { /* logging failure must not break the response */ }

    res.json({ translated });
  } catch (err) {
    console.error('Translate error:', err.message);
    res.status(500).json({ error: 'Не удалось выполнить перевод' });
  }
});

module.exports = router;
