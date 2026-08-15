const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────
// Multer config — saves review photos to public/uploads/reviews
// ─────────────────────────────────────────
const uploadDir = path.join(__dirname, '../../public/uploads/reviews');

// Map allowed mimetypes to a fixed, safe extension — we never trust the
// client-supplied original filename/extension directly, since both the
// filename and the mimetype header are attacker-controlled.
const ALLOWED_MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] || '.bin';
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'review-' + unique + ext);
  }
});

function fileFilter(req, file, cb) {
  if (Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TO_EXT, file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'));
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

// Get all approved reviews (public — shown on homepage)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.photo_url, r.created_at, u.name as customer_name, b.service
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN bookings b ON r.booking_id = b.id
       WHERE r.approved = true
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get all reviews including unapproved (admin only, for moderation)
router.get('/all', verifyToken, requireAdmin, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.photo_url, r.created_at, r.approved, u.name as customer_name, b.service
       FROM reviews r
       JOIN users u ON r.user_id = u.id
       LEFT JOIN bookings b ON r.booking_id = b.id
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get bookings the logged-in customer can review
router.get('/reviewable', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      `SELECT b.id, b.service, b.start_date
       FROM bookings b
       WHERE b.user_id = $1
         AND b.status = 'completed'
         AND NOT EXISTS (
           SELECT 1 FROM reviews r WHERE r.booking_id = b.id
         )
       ORDER BY b.start_date DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviewable bookings' });
  }
});

// Get the logged-in customer's own reviews (any approval status)
router.get('/mine', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.photo_url, r.created_at, r.approved, r.booking_id, b.service
       FROM reviews r
       LEFT JOIN bookings b ON r.booking_id = b.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch your reviews' });
  }
});

// Submit a review for a completed booking (with optional photo)
router.post('/', verifyToken, upload.single('photo'), async (req, res) => {
  const { bookingId, rating, comment } = req.body;
  const ratingNum = parseInt(rating);

  if (!ratingNum || ratingNum < 1 || ratingNum > 5) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  try {
    const booking = await pool.query(
      'SELECT * FROM bookings WHERE id = $1 AND user_id = $2',
      [bookingId, req.user.id]
    );

    if (booking.rows.length === 0) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Booking not found' });
    }
    if (booking.rows[0].status !== 'completed') {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'You can only review completed appointments' });
    }

    const existing = await pool.query('SELECT id FROM reviews WHERE booking_id = $1', [bookingId]);
    if (existing.rows.length > 0) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'You already reviewed this appointment' });
    }

    const photoUrl = req.file ? '/uploads/reviews/' + req.file.filename : null;

    const result = await pool.query(
      `INSERT INTO reviews (user_id, booking_id, rating, comment, photo_url)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, bookingId, ratingNum, comment || null, photoUrl]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ error: 'Failed to submit review' });
  }
});

// Admin: approve/hide a review
router.patch('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { approved } = req.body;

  try {
    const result = await pool.query(
      'UPDATE reviews SET approved = $1 WHERE id = $2 RETURNING *',
      [approved, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Customer: delete their own review (also deletes photo file if present)
router.delete('/mine/:id', verifyToken, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }
    if (existing.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own reviews' });
    }

    const photoUrl = existing.rows[0].photo_url;
    if (photoUrl) {
      const filePath = path.join(__dirname, '../../public', photoUrl);
      fs.unlink(filePath, () => {});
    }

    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Admin: delete a review (also deletes photo file if present)
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT photo_url FROM reviews WHERE id = $1', [id]);
    if (existing.rows.length > 0 && existing.rows[0].photo_url) {
      const filePath = path.join(__dirname, '../../public', existing.rows[0].photo_url);
      fs.unlink(filePath, () => {});
    }

    await pool.query('DELETE FROM reviews WHERE id = $1', [id]);
    res.json({ message: 'Review deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

module.exports = router;