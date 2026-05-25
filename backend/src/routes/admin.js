const express = require('express');
const { getDB } = require('../db/init');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  const db = getDB();
  const users = db.prepare('SELECT COUNT(*) as cnt FROM users WHERE role != ?').get('admin').cnt;
  const tests = db.prepare('SELECT COUNT(*) as cnt FROM tests').get().cnt;
  const results = db.prepare('SELECT COUNT(*) as cnt FROM test_results').get().cnt;
  const aiErrors = db.prepare(`SELECT COUNT(*) as cnt FROM ai_logs WHERE status = 'error'`).get().cnt;
  const pending = db.prepare('SELECT COUNT(*) as cnt FROM pending_questions').get().cnt;
  const anonActions = db.prepare(`SELECT COUNT(*) as cnt FROM user_logs WHERE user_id IS NULL`).get().cnt;
  const loginFailed = db.prepare(`SELECT COUNT(*) as cnt FROM user_logs WHERE action IN ('login_failed', 'login_blocked')`).get().cnt;

  const recentActivity = db
    .prepare(
      `SELECT ul.*, u.username, u.email
       FROM user_logs ul LEFT JOIN users u ON ul.user_id = u.id
       ORDER BY ul.created_at DESC LIMIT 20`
    )
    .all();

  res.json({ users, tests, results, aiErrors, pending, anonActions, loginFailed, recentActivity });
});

// GET /api/admin/users
router.get('/users', (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const db = getDB();

  let where = `WHERE role != 'admin'`;
  const params = [];
  if (search) {
    where += ' AND (email LIKE ? OR username LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM users ${where}`).get(...params).cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const users = db
    .prepare(
      `SELECT id, email, username, role, is_blocked, created_at FROM users ${where}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, parseInt(limit), offset);

  res.json({ users, total });
});

// PUT /api/admin/users/:id/block
router.put('/users/:id/block', (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Нельзя заблокировать администратора' });

  db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(user.is_blocked ? 0 : 1, user.id);
  db.prepare(
    `INSERT INTO user_logs (user_id, action, details) VALUES (?, 'admin_block_user', ?)`
  ).run(req.user.id, JSON.stringify({ target_id: user.id, blocked: !user.is_blocked }));

  res.json({ is_blocked: !user.is_blocked });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Нельзя удалить администратора' });

  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  db.prepare(
    `INSERT INTO user_logs (user_id, action, details) VALUES (?, 'admin_delete_user', ?)`
  ).run(req.user.id, JSON.stringify({ target_email: user.email }));

  res.json({ message: 'Пользователь удалён' });
});

// GET /api/admin/tests
router.get('/tests', (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const db = getDB();

  let where = 'WHERE 1=1';
  const params = [];
  if (search) {
    where += ' AND (t.title LIKE ? OR t.university LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = db
    .prepare(`SELECT COUNT(*) as cnt FROM tests t ${where}`)
    .get(...params).cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const tests = db
    .prepare(
      `SELECT t.*, u.username as author_name,
       (SELECT COUNT(*) FROM questions WHERE test_id = t.id) as question_count
       FROM tests t LEFT JOIN users u ON t.author_id = u.id
       ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, parseInt(limit), offset);

  res.json({ tests, total });
});

// PUT /api/admin/tests/:id/block
router.put('/tests/:id/block', (req, res) => {
  const db = getDB();
  const test = db.prepare('SELECT * FROM tests WHERE id = ?').get(req.params.id);
  if (!test) return res.status(404).json({ error: 'Тест не найден' });

  db.prepare('UPDATE tests SET is_blocked = ? WHERE id = ?').run(test.is_blocked ? 0 : 1, test.id);
  res.json({ is_blocked: !test.is_blocked });
});

// DELETE /api/admin/tests/:id
router.delete('/tests/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM tests WHERE id = ?').run(req.params.id);
  res.json({ message: 'Тест удалён' });
});

// GET /api/admin/ai-logs
router.get('/ai-logs', (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const db = getDB();
  const total = db.prepare('SELECT COUNT(*) as cnt FROM ai_logs').get().cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const logs = db
    .prepare(
      `SELECT al.*, u.username, t.title as test_title
       FROM ai_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN tests t ON al.test_id = t.id
       ORDER BY al.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(parseInt(limit), offset);

  res.json({ logs, total });
});

// GET /api/admin/user-logs
router.get('/user-logs', (req, res) => {
  const { page = 1, limit = 50, user_id, action, date_from, date_to } = req.query;
  const db = getDB();

  let where = 'WHERE 1=1';
  const params = [];

  if (user_id) {
    where += ' AND ul.user_id = ?';
    params.push(parseInt(user_id));
  }
  if (action) {
    where += ' AND ul.action = ?';
    params.push(action);
  }
  if (date_from) {
    where += ' AND ul.created_at >= ?';
    params.push(date_from);
  }
  if (date_to) {
    where += ' AND ul.created_at <= ?';
    params.push(date_to + ' 23:59:59');
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM user_logs ul ${where}`).get(...params).cnt;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const logs = db
    .prepare(
      `SELECT ul.*, u.username, u.email
       FROM user_logs ul LEFT JOIN users u ON ul.user_id = u.id
       ${where} ORDER BY ul.created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...params, parseInt(limit), offset);

  res.json({ logs, total });
});

// GET /api/admin/patch-notes
router.get('/patch-notes', (req, res) => {
  const db = getDB();
  const notes = db.prepare('SELECT * FROM patch_notes ORDER BY published_at DESC').all();
  res.json({ notes });
});

// POST /api/admin/patch-notes
router.post('/patch-notes', (req, res) => {
  const { title, body, is_visible } = req.body;
  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Заголовок и текст обязательны' });
  }

  const db = getDB();
  const result = db
    .prepare('INSERT INTO patch_notes (title, body, is_visible) VALUES (?, ?, ?)')
    .run(title.trim(), body.trim(), is_visible !== false ? 1 : 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

// PUT /api/admin/patch-notes/:id
router.put('/patch-notes/:id', (req, res) => {
  const { title, body, is_visible } = req.body;
  const db = getDB();

  const note = db.prepare('SELECT * FROM patch_notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Запись не найдена' });

  db.prepare('UPDATE patch_notes SET title = ?, body = ?, is_visible = ? WHERE id = ?').run(
    title !== undefined ? title.trim() : note.title,
    body !== undefined ? body.trim() : note.body,
    is_visible !== undefined ? (is_visible ? 1 : 0) : note.is_visible,
    note.id
  );

  res.json({ message: 'Запись обновлена' });
});

// DELETE /api/admin/patch-notes/:id
router.delete('/patch-notes/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM patch_notes WHERE id = ?').run(req.params.id);
  res.json({ message: 'Запись удалена' });
});

// GET /api/admin/pending
router.get('/pending', (req, res) => {
  const db = getDB();
  const pending = db
    .prepare(
      `SELECT pq.*, t.title as test_title, u.username as author_name
       FROM pending_questions pq
       LEFT JOIN tests t ON pq.test_id = t.id
       LEFT JOIN users u ON t.author_id = u.id
       ORDER BY pq.created_at DESC`
    )
    .all();

  res.json({ pending: pending.map((p) => ({ ...p, options: JSON.parse(p.options) })) });
});

module.exports = router;
