require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');
const { startReminderCron } = require('./cron/reminders');

const app = express();

// ─────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled since it can break inline scripts/styles you already use
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allows review photos to load correctly
}));

// ─────────────────────────────────────────
// CORS — locked to your actual domain in production
// ─────────────────────────────────────────
const allowedOrigins = [
  'https://chrishaircut.com',
  'https://www.chrishaircut.com',
  'http://localhost:3000', // keep for local dev
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// ─────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────

// General API limiter — generous, just stops abuse/scraping
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Strict limiter for auth routes — prevents brute-force login/signup attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/auth',     require('./routes/auth'));
app.use('/api/bookings', require('./routes/bookings'));
app.use('/api/reviews',  require('./routes/reviews'));

app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startReminderCron();
});