const jwt = require('jsonwebtoken');
const { getDB } = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDB();
    const user = db
      .prepare('SELECT id, email, username, role, is_blocked FROM users WHERE id = ?')
      .get(decoded.userId);

    if (!user || user.is_blocked) {
      return res.status(401).json({ error: 'Пользователь не найден или заблокирован' });
    }

    req.user = user;
    next();
  } catch {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Требуются права администратора' });
  }
  next();
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const db = getDB();
    const user = db
      .prepare('SELECT id, email, username, role, is_blocked FROM users WHERE id = ?')
      .get(decoded.userId);
    req.user = user && !user.is_blocked ? user : null;
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { authenticateToken, requireAdmin, optionalAuth, JWT_SECRET };
