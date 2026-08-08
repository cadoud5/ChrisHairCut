const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Helper to bail out with validation errors formatted nicely
function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: errors.array()[0].msg });
    return true;
  }
  return false;
}

// ─────────────────────────────────────────
// Signup
// ─────────────────────────────────────────
router.post('/signup',
  [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name is required'),
    body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
    body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be at least 6 characters'),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number is too long'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { name, email, password, phone } = req.body;

    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Email already registered' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, phone, role)
         VALUES ($1, $2, $3, $4, 'customer')
         RETURNING id, name, email, phone, role`,
        [name, email, passwordHash, phone || null]
      );

      const user = result.rows[0];

      // Retroactively link any past guest bookings made with this same email
      try {
        await pool.query(
          'UPDATE bookings SET user_id = $1 WHERE email = $2 AND user_id IS NULL',
          [user.id, email]
        );
      } catch (linkErr) {
        console.error('Failed to link past bookings on signup:', linkErr.message);
        // Not fatal — account creation still succeeds even if this step fails
      }

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.status(201).json({ user, token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Signup failed' });
    }
  }
);

// ─────────────────────────────────────────
// Login
// ─────────────────────────────────────────
router.post('/login',
  [
    body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { email, password } = req.body;

    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

      res.json({
        user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
        token
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Login failed' });
    }
  }
);

// Get current account info
router.get('/me', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, phone, role FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch account' });
  }
});

// ─────────────────────────────────────────
// Update account info
// ─────────────────────────────────────────
router.patch('/me',
  verifyToken,
  [
    body('name').optional({ checkFalsy: true }).trim().isLength({ min: 1, max: 100 }),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
    body('newPassword').optional({ checkFalsy: true }).isLength({ min: 6, max: 128 }).withMessage('New password must be at least 6 characters'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;

    const { name, email, phone, currentPassword, newPassword } = req.body;

    try {
      const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      const user = existing.rows[0];

      if (email && email !== user.email) {
        const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email, req.user.id]);
        if (emailCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Email already in use' });
        }
      }

      let passwordHash = user.password_hash;
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ error: 'Current password required to set a new password' });
        }
        const match = await bcrypt.compare(currentPassword, user.password_hash);
        if (!match) {
          return res.status(401).json({ error: 'Current password is incorrect' });
        }
        passwordHash = await bcrypt.hash(newPassword, 10);
      }

      const result = await pool.query(
        `UPDATE users
         SET name = COALESCE($1, name),
             email = COALESCE($2, email),
             phone = COALESCE($3, phone),
             password_hash = $4
         WHERE id = $5
         RETURNING id, name, email, phone, role`,
        [name || null, email || null, phone || null, passwordHash, req.user.id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to update account' });
    }
  }
);

// Delete account (requires password confirmation)
router.delete('/me', verifyToken, async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required to delete account' });
  }

  try {
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = existing.rows[0];

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ message: 'Account deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;