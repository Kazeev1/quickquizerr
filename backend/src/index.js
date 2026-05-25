require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { initDB } = require('./db/init');
const authRoutes = require('./routes/auth');
const testRoutes = require('./routes/tests');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const compareRoutes = require('./routes/compare');
const patchNotesRoutes = require('./routes/patchNotes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Слишком много запросов. Попробуйте позже.' },
});
app.use('/api/', globalLimiter);

initDB();

app.use('/api/auth', authRoutes);
app.use('/api/tests', testRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/compare', compareRoutes);
app.use('/api/patch-notes', patchNotesRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Serve frontend static files (production)
const frontendDist = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой. Максимум 50 MB.' });
  }
  console.error(err.stack);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.listen(PORT, () => {
  console.log(`\n✓ Quizify backend running on port ${PORT}`);
});
