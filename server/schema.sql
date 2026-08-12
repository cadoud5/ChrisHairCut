-- chrishaircut.com — PostgreSQL schema
--
-- Reconstructed from the actual queries in server/routes/*.js.
-- Run this against a fresh database to get the app running locally:
--
--   psql -U your_user -d your_db -f schema.sql

-- ─────────────────────────────────────────
-- users
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone         VARCHAR(20),
  role          VARCHAR(20) NOT NULL DEFAULT 'customer', -- 'customer' | 'admin'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────
-- bookings
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER REFERENCES users(id) ON DELETE SET NULL, -- null = guest booking
  name               VARCHAR(150) NOT NULL,
  phone              VARCHAR(20) NOT NULL,
  email              VARCHAR(255) NOT NULL,
  service            VARCHAR(200) NOT NULL,
  price              VARCHAR(30) NOT NULL,       -- stored as text (e.g. "$35"), not numeric
  start_date         TIMESTAMPTZ NOT NULL,
  end_date           TIMESTAMPTZ NOT NULL,
  notes              TEXT,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | confirmed | completed | cancelled
  paid_amount        VARCHAR(30),
  calendar_event_id  VARCHAR(255),                -- Google Calendar event id, if created
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(email);
CREATE INDEX IF NOT EXISTS idx_bookings_start_date ON bookings(start_date);

-- ─────────────────────────────────────────
-- reviews
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  booking_id  INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  photo_url   VARCHAR(255),
  approved    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id) -- one review per completed booking
);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved);

-- ─────────────────────────────────────────
-- Create your own admin account after running this file:
--
--   INSERT INTO users (name, email, password_hash, role)
--   VALUES ('Chris', 'you@example.com', '<bcrypt hash>', 'admin');
--
-- Generate the bcrypt hash with:
--   node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
-- ─────────────────────────────────────────