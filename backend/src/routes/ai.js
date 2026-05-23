const express = require('express');
const { explainQuestion } = require('../services/aiService');
const { optionalAuth } = require('../middleware/auth');
const { getDB } = require('../db/init');

const router = express.Router();

// POST /api/ai/explain — generate explanation for a question
// Body: { text, options, correct_answers }
router.post('/explain', optionalAuth, async (req, res) => {
  const { text, options, correct_answers } = req.body;

  if (!text || !Array.isArray(options) || !Array.isArray(correct_answers)) {
    return res.status(400).json({ error: 'Неверные данные вопроса' });
  }

  try {
    const explanation = await explainQuestion(text, options, correct_answers);

    // Log explanation generation
    try {
      const db = getDB();
      const action = req.user ? 'explain_ai' : 'anon_explain_ai';
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

module.exports = router;
