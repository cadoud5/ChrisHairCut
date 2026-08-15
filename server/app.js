const express = require('express');
const cors    = require('cors');
const path    = require('path');
const helmet  = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ─────────────────────────────────────────
// Security headers
// ─────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // All former inline onclick/onsubmit/onchange handlers and inline style
      // attributes have been moved to external script.js/admin.js (bound via
      // data-action attributes) and style.css, so CSP no longer needs to
      // relax script-src/style-src with 'unsafe-inline'.
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameSrc: ['https://www.google.com'], // Google Maps embed
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
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

module.exports = app;