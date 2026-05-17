// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

// POST /api/auth/register
router.post('/register', [
  body('full_name').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { full_name, email, password } = req.body;

  try {
    const [existing] = await db.execute(
      'SELECT user_id FROM users WHERE email = ?', [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const [result] = await db.execute(
      'INSERT INTO users (full_name, email, password_hash) VALUES (?, ?, ?)',
      [full_name, email, password_hash]
    );

    req.session.userId = result.insertId;
    req.session.userName = full_name;

    res.status(201).json({
      message: 'Account created successfully!',
      user: { id: result.insertId, full_name, email }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT * FROM users WHERE email = ?', [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.session.userId = user.user_id;
    req.session.userName = user.full_name;

    res.json({
      message: 'Login successful!',
      user: { id: user.user_id, full_name: user.full_name, email: user.email }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Logged out successfully.' });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session.userId) {
    res.json({
      loggedIn: true,
      user: { id: req.session.userId, full_name: req.session.userName }
    });
  } else {
    res.json({ loggedIn: false });
  }
});
// POST /api/auth/admin-login
router.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  
  // Hardcoded admin credentials
  if (username === 'admin' && password === 'admin123') {
    req.session.isAdmin = true;
    res.json({ message: 'Admin login successful!', admin: true });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials.' });
  }
});

// GET /api/admin/events - get all events for admin
router.get('/admin/events', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Admin access required.' });
  }
  try {
    const db = require('../config/db');
    const [events] = await db.execute(`
      SELECT e.event_id, e.event_title, e.event_date, e.event_time,
             e.price, e.total_seats, e.available_seats, e.status,
             sc.category_name AS sport,
             v.venue_name AS venue
      FROM events e
      JOIN sport_categories sc ON e.category_id = sc.category_id
      JOIN venues v ON e.venue_id = v.venue_id
      ORDER BY e.event_date ASC
    `);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch events.' });
  }
});

// DELETE /api/admin/events/:id
router.delete('/admin/events/:id', async (req, res) => {
  if (!req.session.isAdmin) {
    return res.status(401).json({ error: 'Admin access required.' });
  }
  try {
    const db = require('../config/db');
    await db.execute('DELETE FROM tickets WHERE booking_id IN (SELECT booking_id FROM bookings WHERE event_id = ?)', [req.params.id]);
    await db.execute('DELETE FROM bookings WHERE event_id = ?', [req.params.id]);
    await db.execute('DELETE FROM events WHERE event_id = ?', [req.params.id]);
    res.json({ message: 'Event deleted successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not delete event.' });
  }
});

// POST /api/auth/admin-login
router.post('/admin-login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === 'admin' && password === 'admin123') {
    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) {
        return res.status(500).json({ error: 'Session error.' });
      }
      res.json({ message: 'Admin login successful!', admin: true });
    });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials.' });
  }
});
module.exports = router;
