const express = require('express');
const multer = require('multer');
const { getDB } = require('../db/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { processFile } = require('../services/fileProcessor');
const { extractQuestionsFromText } = require('../services/aiService');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (allowed.includes(file.mimetype) || ['pdf', 'doc', 'docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат. Используйте PDF, DOC или DOCX.'));
    }
  },
});

// GET /api/tests — list tests
router.get('/', optionalAuth, (req, res) => {
  const { search, university, sort = 'newest', page = 1, limit = 20 } = req.query;
  const db = getDB();

  let where = 'WHERE t.is_blocked = 0';
  const params = [];

  if (req.user) {
    where += ` AND (t.access_type = 'public' OR t.author_id = ?)`;
    params.push(req.user.id);
  } else {
    where += ` AND t.access_type = 'public'`;
  }

  if (search) {
    where += ` AND (t.title LIKE ? OR t.university LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (university) {
    where += ` AND t.university = ?`;
    params.push(university);
  }

  const orderMap = { newest: 'DESC', oldest: 'ASC', name: 'DESC' };
  const orderCol = sort === 'name' ? 't.title' : 't.created_at';
  const orderDir = sort === 'oldest' ? 'ASC' : 'DESC';

  const countRow = db
    .prepare(
      `SELECT COUNT(*) as cnt FROM tests t LEFT JOIN users u ON t.author_id = u.id ${where}`
    )
    .get(...params);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const tests = db
    .prepare(
      `SELECT t.*, u.username as author_name,
       (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
       FROM tests t LEFT JOIN users u ON t.author_id = u.id
       ${where} ORDER BY ${orderCol} ${orderDir} LIMIT ? OFFSET ?`
    )
    .all(...params, parseInt(limit), offset);

  const universities = db
    .prepare(
      `SELECT DISTINCT university FROM tests WHERE is_blocked = 0 AND university != '' ORDER BY university`
    )
    .all()
    .map((r) => r.university);

  res.json({ tests, total: countRow.cnt, universities });
});

// GET /api/tests/:id — get test by id
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDB();
  const test = db
    .prepare(
      `SELECT t.*, u.username as author_name,
       (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
       FROM tests t LEFT JOIN users u ON t.author_id = u.id
       WHERE t.id = ? AND t.is_blocked = 0`
    )
    .get(req.params.id);

  if (!test) return res.status(404).json({ error: 'Тест не найден' });

  if (test.access_type === 'private') {
    if (!req.user || (req.user.id !== test.author_id && req.user.role !== 'admin')) {
      return res.status(403).json({ error: 'Доступ к тесту ограничен' });
    }
  }

  const questions = db
    .prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY order_num, id')
    .all(test.id);

  const parsedQuestions = questions.map((q) => ({
    ...q,
    options: JSON.parse(q.options),
    correct_answers: JSON.parse(q.correct_answers),
  }));

  res.json({ test, questions: parsedQuestions });
});

// POST /api/tests — create test manually
router.post('/', authenticateToken, (req, res) => {
  const { title, university, access_type, question_type, questions } = req.body;

  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Название теста обязательно' });
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

  if (Array.isArray(questions) && questions.length > 0) {
    const insertQ = db.prepare(
      `INSERT INTO questions (test_id, text, options, correct_answers, order_num)
       VALUES (?, ?, ?, ?, ?)`
    );
    questions.forEach((q, i) => {
      if (q.text && Array.isArray(q.options) && q.options.length >= 2) {
        insertQ.run(
          testId,
          q.text.trim(),
          JSON.stringify(q.options),
          JSON.stringify(q.correct_answers || [0]),
          i
        );
      }
    });
  }

  db.prepare(
    `INSERT INTO user_logs (user_id, action, details) VALUES (?, 'create_test', ?)`
  ).run(req.user.id, JSON.stringify({ test_id: testId, title }));

  res.status(201).json({ id: testId, message: 'Тест создан' });
});

// POST /api/tests/upload — upload file, detect images, process with AI
router.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const { title, university, access_type, question_type, doc_mode } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Название теста обязательно' });
  }

  const db = getDB();

  try {
    // Step 1: Extract text and detect images
    const { text, hasImages, imageWarnings, hash } = await processFile(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname
    );

    // Step 2: Check for duplicates by file hash
    const duplicate = db
      .prepare(
        `SELECT t.id, t.title FROM tests t WHERE t.file_hash = ? AND t.is_blocked = 0`
      )
      .get(hash);

    // Step 3: If images found, return warning — client decides to continue
    if (hasImages && req.body.force !== 'true') {
      return res.status(200).json({
        hasImages: true,
        imageWarnings,
        duplicate: duplicate || null,
        textPreview: text.substring(0, 300),
      });
    }

    if (duplicate && req.body.ignore_duplicate !== 'true') {
      return res.status(200).json({
        duplicate,
        hasImages: false,
      });
    }

    // Step 4: AI extraction
    const mode = doc_mode === 'without_answers' ? 'without_answers' : 'with_answers';
    const { confirmed, pending, total, usage } = await extractQuestionsFromText(
      text,
      question_type === 'multiple' ? 'multiple' : 'single',
      mode
    );

    // Deduplicate questions by normalized text before saving
    const normalize = (t) => t.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
    const seenTexts = new Set();
    const filterUnique = (qs) => qs.filter((q) => {
      const key = normalize(q.text);
      if (seenTexts.has(key)) return false;
      seenTexts.add(key);
      return true;
    });
    const uniqueConfirmed = filterUnique(confirmed);
    const uniquePending = filterUnique(pending);
    const duplicatesRemoved = total - uniqueConfirmed.length - uniquePending.length;

    // Step 5: Create test
    const testResult = db
      .prepare(
        `INSERT INTO tests (title, university, author_id, access_type, question_type, file_hash)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        title.trim(),
        (university || '').trim(),
        req.user.id,
        access_type === 'private' ? 'private' : 'public',
        question_type === 'multiple' ? 'multiple' : 'single',
        hash
      );

    const testId = testResult.lastInsertRowid;

    // Step 6: Insert confirmed questions
    const insertQ = db.prepare(
      `INSERT INTO questions (test_id, text, options, correct_answers, order_num)
       VALUES (?, ?, ?, ?, ?)`
    );
    uniqueConfirmed.forEach((q, i) => {
      insertQ.run(testId, q.text, JSON.stringify(q.options), JSON.stringify(q.correct_answers), i);
    });

    // Step 7: Insert pending questions for review
    const insertP = db.prepare(
      `INSERT INTO pending_questions (test_id, text, options, confidence) VALUES (?, ?, ?, ?)`
    );
    uniquePending.forEach((q) => {
      insertP.run(testId, q.text, JSON.stringify(q.options), q.confidence);
    });

    // Log AI processing
    db.prepare(
      `INSERT INTO ai_logs (test_id, user_id, status, details) VALUES (?, ?, 'success', ?)`
    ).run(
      testId,
      req.user.id,
      JSON.stringify({
        total,
        confirmed: uniqueConfirmed.length,
        pending: uniquePending.length,
        duplicates_removed: duplicatesRemoved,
        tokens: usage,
      })
    );

    db.prepare(
      `INSERT INTO user_logs (user_id, action, details) VALUES (?, 'upload_test', ?)`
    ).run(req.user.id, JSON.stringify({ test_id: testId, title, total }));

    res.status(201).json({
      id: testId,
      confirmed: confirmed.length,
      pending: pending.length,
      total,
      message: 'Тест создан',
    });
  } catch (err) {
    console.error('Upload error:', err);

    db.prepare(
      `INSERT INTO ai_logs (user_id, status, error_message) VALUES (?, 'error', ?)`
    ).run(req.user.id, err.message);

    res.status(500).json({ error: err.message || 'Ошибка обработки файла' });
  }
});

// GET /api/tests/:id/pending — get pending questions for review
router.get('/:id/pending', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);

  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const pending = db
    .prepare('SELECT * FROM pending_questions WHERE test_id = ? ORDER BY id')
    .all(test.id);

  res.json({
    pending: pending.map((p) => ({ ...p, options: JSON.parse(p.options) })),
  });
});

// POST /api/tests/:id/pending/:pqId — resolve pending question
router.post('/:id/pending/:pqId', authenticateToken, (req, res) => {
  const { correct_answers } = req.body;
  const db = getDB();

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const pq = db
    .prepare('SELECT * FROM pending_questions WHERE id = ? AND test_id = ?')
    .get(req.params.pqId, req.params.id);
  if (!pq) return res.status(404).json({ error: 'Вопрос не найден' });

  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM questions WHERE test_id = ?')
    .get(req.params.id).cnt;

  db.prepare(
    `INSERT INTO questions (test_id, text, options, correct_answers, order_num)
     VALUES (?, ?, ?, ?, ?)`
  ).run(req.params.id, pq.text, pq.options, JSON.stringify(correct_answers || [0]), count);

  db.prepare('DELETE FROM pending_questions WHERE id = ?').run(pq.id);

  res.json({ message: 'Вопрос добавлен в тест' });
});

// DELETE /api/tests/:id/pending/:pqId — skip pending question
router.delete('/:id/pending/:pqId', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  db.prepare('DELETE FROM pending_questions WHERE id = ? AND test_id = ?').run(
    req.params.pqId,
    req.params.id
  );
  res.json({ message: 'Вопрос пропущен' });
});

// PUT /api/tests/:id — update test metadata
router.put('/:id', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const { title, university, access_type, question_type } = req.body;
  db.prepare(
    `UPDATE tests SET title=?, university=?, access_type=?, question_type=? WHERE id=?`
  ).run(
    title || test.title,
    university !== undefined ? university : test.university,
    access_type || test.access_type,
    question_type || test.question_type,
    test.id
  );

  res.json({ message: 'Тест обновлён' });
});

// DELETE /api/tests/:id — delete test
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  db.prepare('DELETE FROM tests WHERE id = ?').run(test.id);
  res.json({ message: 'Тест удалён' });
});

// POST /api/tests/:id/questions — add question
router.post('/:id/questions', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const { text, options, correct_answers } = req.body;
  if (!text || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Неверные данные вопроса' });
  }

  const count = db
    .prepare('SELECT COUNT(*) as cnt FROM questions WHERE test_id = ?')
    .get(test.id).cnt;

  const result = db
    .prepare(
      `INSERT INTO questions (test_id, text, options, correct_answers, order_num)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      test.id,
      text.trim(),
      JSON.stringify(options),
      JSON.stringify(correct_answers || [0]),
      count
    );

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/tests/:id/questions/:qId — update question
router.put('/:id/questions/:qId', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const q = db
    .prepare('SELECT * FROM questions WHERE id = ? AND test_id = ?')
    .get(req.params.qId, req.params.id);
  if (!q) return res.status(404).json({ error: 'Вопрос не найден' });

  const { text, options, correct_answers } = req.body;
  db.prepare(
    `UPDATE questions SET text=?, options=?, correct_answers=? WHERE id=?`
  ).run(
    text || q.text,
    options ? JSON.stringify(options) : q.options,
    correct_answers ? JSON.stringify(correct_answers) : q.correct_answers,
    q.id
  );

  res.json({ message: 'Вопрос обновлён' });
});

// DELETE /api/tests/:id/questions/:qId — delete question
router.delete('/:id/questions/:qId', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  db.prepare('DELETE FROM questions WHERE id = ? AND test_id = ?').run(
    req.params.qId,
    req.params.id
  );
  res.json({ message: 'Вопрос удалён' });
});

// GET /api/tests/:id/token-usage — token usage for test owner
router.get('/:id/token-usage', authenticateToken, (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });
  if (test.author_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Нет доступа' });
  }

  const logs = db
    .prepare(`SELECT details FROM ai_logs WHERE test_id = ? AND status = 'success'`)
    .all(req.params.id);

  if (logs.length === 0) {
    return res.json({ has_logs: false, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, cost_usd: 0, cost_kzt: 0 });
  }

  let prompt_tokens = 0;
  let completion_tokens = 0;

  for (const log of logs) {
    try {
      const d = JSON.parse(log.details || '{}');
      if (d.tokens) {
        prompt_tokens += d.tokens.prompt_tokens || 0;
        completion_tokens += d.tokens.completion_tokens || 0;
      }
    } catch {/* skip malformed */}
  }

  const total_tokens = prompt_tokens + completion_tokens;
  // gpt-4.1-nano: $0.10/1M input, $0.40/1M output
  const cost_usd = (prompt_tokens * 0.10 + completion_tokens * 0.40) / 1_000_000;
  const cost_kzt = cost_usd * 500;

  res.json({ has_logs: true, prompt_tokens, completion_tokens, total_tokens, cost_usd, cost_kzt });
});

// POST /api/tests/:id/results — save result
router.post('/:id/results', optionalAuth, (req, res) => {
  const { score, total, time_spent, answers, mode } = req.body;
  const db = getDB();
  const test = db.prepare('SELECT id FROM tests WHERE id = ? AND is_blocked = 0').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });

  const result = db
    .prepare(
      `INSERT INTO test_results (user_id, test_id, score, total, time_spent, answers, mode)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user ? req.user.id : null,
      test.id,
      score || 0,
      total || 0,
      time_spent || 0,
      JSON.stringify(answers || []),
      mode || 'normal'
    );

  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /api/tests/:id/results/:resultId — get specific result
router.get('/:id/results/:resultId', (req, res) => {
  const db = getDB();
  const result = db
    .prepare('SELECT * FROM test_results WHERE id = ? AND test_id = ?')
    .get(req.params.resultId, req.params.id);
  if (!result) return res.status(404).json({ error: 'Результат не найден' });

  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(result.test_id);
  const questions = db
    .prepare('SELECT * FROM questions WHERE test_id = ? ORDER BY order_num, id')
    .all(result.test_id);

  res.json({
    result: { ...result, answers: JSON.parse(result.answers) },
    test,
    questions: questions.map((q) => ({
      ...q,
      options: JSON.parse(q.options),
      correct_answers: JSON.parse(q.correct_answers),
    })),
  });
});

module.exports = router;
