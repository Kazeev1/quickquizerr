const express = require('express');
const { getDB } = require('../db/init');

const router = express.Router();

// GET /api/patch-notes — public, returns latest visible patch notes
router.get('/', (req, res) => {
  const { page = 1, limit = 5 } = req.query;
  const db = getDB();

  const total = db
    .prepare('SELECT COUNT(*) as cnt FROM patch_notes WHERE is_visible = 1')
    .get().cnt;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const notes = db
    .prepare(
      'SELECT * FROM patch_notes WHERE is_visible = 1 ORDER BY published_at DESC LIMIT ? OFFSET ?'
    )
    .all(parseInt(limit), offset);

  res.json({ notes, total });
});

module.exports = router;
