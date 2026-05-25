const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { getDB } = require('../db/init');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { sendVerificationEmail } = require('../services/emailService');

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
    const verifyToken = crypto.randomBytes(32).toString('hex');
    const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const result = db
      .prepare(
        `INSERT INTO users (email, password_hash, username, email_verify_token, email_verify_expires)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(email.toLowerCase(), hash, username.trim(), verifyToken, verifyExpires);

    db.prepare(`INSERT INTO user_logs (user_id, action, ip) VALUES (?, 'register', ?)`).run(
      result.lastInsertRowid, req.ip
    );

    // Send verification email (non-blocking)
    sendVerificationEmail(email.toLowerCase(), verifyToken).catch((err) => {
      console.error('[EMAIL] Failed to send verification email:', err.message);
    });

    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: result.lastInsertRowid,
        email: email.toLowerCase(),
        username: username.trim(),
        role: 'user',
        email_verified: false,
      },
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
    db.prepare(`INSERT INTO user_logs (user_id, action, ip) VALUES (?, 'login', ?)`).run(user.id, req.ip);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        email_verified: !!user.email_verified,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/auth/verify-email?token=xxx
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Токен не указан' });

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE email_verify_token = ?').get(token);

  if (!user) return res.status(400).json({ error: 'Недействительная или уже использованная ссылка' });

  if (new Date(user.email_verify_expires) < new Date()) {
    return res.status(400).json({ error: 'Ссылка истекла. Запросите новую.' });
  }

  db.prepare(
    `UPDATE users SET email_verified = 1, email_verify_token = NULL, email_verify_expires = NULL WHERE id = ?`
  ).run(user.id);

  db.prepare(`INSERT INTO user_logs (user_id, action, ip) VALUES (?, 'email_verified', ?)`).run(user.id, req.ip);

  res.json({ message: 'Email подтверждён', email: user.email });
});

// POST /api/auth/resend-verification
router.post('/resend-verification', authenticateToken, async (req, res) => {
  if (req.user.email_verified) {
    return res.status(400).json({ error: 'Email уже подтверждён' });
  }

  const db = getDB();
  const verifyToken = crypto.randomBytes(32).toString('hex');
  const verifyExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(
    `UPDATE users SET email_verify_token = ?, email_verify_expires = ? WHERE id = ?`
  ).run(verifyToken, verifyExpires, req.user.id);

  try {
    await sendVerificationEmail(req.user.email, verifyToken);
    res.json({ message: 'Письмо отправлено' });
  } catch (err) {
    console.error('[EMAIL] Resend failed:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: { ...req.user, email_verified: !!req.user.email_verified } });
});

module.exports = router;
