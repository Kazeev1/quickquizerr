const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/testpad.db');

let db;

function getDB() {
  return db;
}

function initDB() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      is_blocked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      university TEXT DEFAULT '',
      author_id INTEGER,
      access_type TEXT DEFAULT 'public',
      question_type TEXT DEFAULT 'single',
      is_blocked INTEGER DEFAULT 0,
      file_hash TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      correct_answers TEXT NOT NULL,
      order_num INTEGER DEFAULT 0,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pending_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER,
      text TEXT NOT NULL,
      options TEXT NOT NULL,
      confidence REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      test_id INTEGER,
      score INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      time_spent INTEGER DEFAULT 0,
      answers TEXT DEFAULT '[]',
      mode TEXT DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS ai_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_id INTEGER,
      user_id INTEGER,
      status TEXT NOT NULL,
      error_message TEXT,
      details TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT DEFAULT '{}',
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@testpad.com';
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

  if (!adminExists) {
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(
      `INSERT INTO users (email, password_hash, username, role) VALUES (?, ?, 'Администратор', 'admin')`
    ).run(adminEmail, hash);
    console.log(`\n✓ Admin created: ${adminEmail} / ${adminPassword}\n`);
  }

  console.log('✓ Database initialized');
  return db;
}

module.exports = { initDB, getDB };
