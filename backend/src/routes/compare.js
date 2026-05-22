const express = require('express');
const multer = require('multer');
const { authenticateToken } = require('../middleware/auth');
const { processFile } = require('../services/fileProcessor');
const { extractUniqueQuestions } = require('../services/aiService');
const { getDB } = require('../db/init');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (['pdf', 'doc', 'docx'].includes(ext)) cb(null, true);
    else cb(new Error('Используйте PDF, DOC или DOCX'));
  },
});

// POST /api/compare — compare multiple files, find unique questions
router.post('/', authenticateToken, upload.array('files', 10), async (req, res) => {
  if (!req.files || req.files.length < 2) {
    return res.status(400).json({ error: 'Загрузите минимум 2 файла для сравнения' });
  }

  try {
    const files = [];
    for (const file of req.files) {
      const { text } = await processFile(file.buffer, file.mimetype, file.originalname);
      files.push({ name: file.originalname, text });
    }

    const result = await extractUniqueQuestions(files);
    res.json(result);
  } catch (err) {
    console.error('Compare error:', err.message);
    res.status(500).json({ error: err.message || 'Ошибка сравнения файлов' });
  }
});

// POST /api/compare/create-test — create test from unique questions
router.post('/create-test', authenticateToken, async (req, res) => {
  const { title, university, access_type, question_type, questions } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Название теста обязательно' });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Нет вопросов для создания теста' });
  }

  const db = getDB();
  const result = db
    .prepare(
      `INSERT INTO tests (title, university, author_id, access_type, question_type)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      title.trim(),
      (university || '').trim(),
      req.user.id,
      access_type === 'private' ? 'private' : 'public',
      question_type === 'multiple' ? 'multiple' : 'single'
    );

  const testId = result.lastInsertRowid;

  const insertQ = db.prepare(
    `INSERT INTO questions (test_id, text, options, correct_answers, order_num)
     VALUES (?, ?, ?, ?, ?)`
  );
  questions.forEach((q, i) => {
    insertQ.run(
      testId,
      q.text.trim(),
      JSON.stringify(q.options),
      JSON.stringify(q.correct_answers || [0]),
      i
    );
  });

  db.prepare(
    `INSERT INTO user_logs (user_id, action, details) VALUES (?, 'compare_create_test', ?)`
  ).run(req.user.id, JSON.stringify({ test_id: testId, title, total: questions.length }));

  res.status(201).json({ id: testId, message: 'Тест создан' });
});

module.exports = router;
