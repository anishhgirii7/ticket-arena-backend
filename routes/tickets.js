// routes/tickets.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { requireLogin } = require('../middleware/authMiddleware');

// GET /api/tickets/my
router.get('/my', requireLogin, async (req, res) => {
  const user_id = req.session.userId;

  try {
    const [tickets] = await db.execute(`
      SELECT t.id, t.seat_number, t.price,
             b.quantity, b.status AS booking_status, b.created_at AS booked_on,
             e.title AS event_title, e.event_date,
             sc.name AS sport, sc.icon,
             v.name AS venue, v.city
      FROM tickets t
      JOIN bookings b ON t.booking_id = b.id
      JOIN events e ON b.event_id = e.id
      JOIN sport_categories sc ON e.sport_category_id = sc.id
      JOIN venues v ON e.venue_id = v.id
      WHERE b.user_id = ?
      ORDER BY b.created_at DESC
    `, [user_id]);

    res.json(tickets);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch your tickets.' });
  }
});

module.exports = router;
