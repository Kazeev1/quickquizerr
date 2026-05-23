const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { getDB } = require('../db/init');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток входа. Попробуйте позже.' },
});

router.post('/register', async (req, res) => {
  const { email, password, confirm_password, username } = req.body;

  if (!email || !password || !confirm_password || !username) {
    return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ error: 'Пароли не совпадают' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен содержать минимум 6 символов' });
  }
  if (username.trim().length < 2) {
    return res.status(400).json({ error: 'Имя пользователя слишком короткое' });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Неверный формат email' });
  }

  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'Email уже зарегистрирован' });
    }

    const hash = await bcrypt.hash(password, 10);
    const result = db
      .prepare('INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)')
      .run(email.toLowerCase(), hash, username.trim());

    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare(
      `INSERT INTO user_logs (user_id, action, ip) VALUES (?, 'register', ?)`
    ).run(result.lastInsertRowid, req.ip);

    res.status(201).json({
      token,
      user: { id: result.lastInsertRowid, email: email.toLowerCase(), username: username.trim(), role: 'user' },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email и пароль обязательны' });
  }

  try {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user) {
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (NULL, 'login_failed', ?, ?)`
      ).run(JSON.stringify({ reason: 'user_not_found', email: email.toLowerCase() }), req.ip);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }
    if (user.is_blocked) {
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (?, 'login_blocked', ?, ?)`
      ).run(user.id, JSON.stringify({ email: user.email }), req.ip);
      return res.status(403).json({ error: 'Аккаунт заблокирован' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      db.prepare(
        `INSERT INTO user_logs (user_id, action, details, ip) VALUES (?, 'login_failed', ?, ?)`
      ).run(user.id, JSON.stringify({ reason: 'wrong_password', email: user.email }), req.ip);
      return res.status(401).json({ error: 'Неверный email или пароль' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
    db.prepare(
      `INSERT INTO user_logs (user_id, action, ip) VALUES (?, 'login', ?)`
    ).run(user.id, req.ip);

    res.json({
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
