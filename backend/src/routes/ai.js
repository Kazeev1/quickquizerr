const express = require('express');
const { explainQuestion } = require('../services/aiService');

const router = express.Router();

// POST /api/ai/explain — generate explanation for a question
// Body: { text, options, correct_answers }
router.post('/explain', async (req, res) => {
  const { text, options, correct_answers } = req.body;

  if (!text || !Array.isArray(options) || !Array.isArray(correct_answers)) {
    return res.status(400).json({ error: 'Неверные данные вопроса' });
  }

  try {
    const explanation = await explainQuestion(text, options, correct_answers);
    res.json({ explanation });
  } catch (err) {
    console.error('Explain error:', err.message);
    res.status(500).json({ error: 'Не удалось получить объяснение от ИИ' });
  }
});

module.exports = router;
