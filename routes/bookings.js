const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/db');

router.post('/', [
  body('event_id').isInt({ min: 1 }).withMessage('Valid event ID required'),
  body('quantity').isInt({ min: 1, max: 10 }).withMessage('Quantity must be between 1 and 10')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { event_id, quantity } = req.body;
  const user_id = req.session.userId || req.body.user_id;

  if (!user_id) {
    return res.status(401).json({ error: 'Please log in to book tickets.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [eventRows] = await conn.execute(
      'SELECT * FROM events WHERE event_id = ? FOR UPDATE', [event_id]
    );

    if (eventRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Event not found.' });
    }

    const event = eventRows[0];

    if (event.available_seats < quantity) {
      await conn.rollback();
      return res.status(400).json({ error: `Only ${event.available_seats} seats available.` });
    }

    const total_amount = event.price * quantity;

    const [bookingResult] = await conn.execute(
      'INSERT INTO bookings (user_id, event_id, quantity, total_amount, booking_status) VALUES (?, ?, ?, ?, ?)',
      [user_id, event_id, quantity, total_amount, 'Confirmed']
    );
    const booking_id = bookingResult.insertId;

    for (let i = 1; i <= quantity; i++) {
      const seat_number = `SEAT-${booking_id}-${i}`;
      await conn.execute(
        'INSERT INTO tickets (booking_id, seat_number, ticket_price, ticket_status) VALUES (?, ?, ?, ?)',
        [booking_id, seat_number, event.price, 'Active']
      );
    }

    await conn.execute(
      'UPDATE events SET available_seats = available_seats - ? WHERE event_id = ?',
      [quantity, event_id]
    );

    await conn.commit();

    res.status(201).json({
      message: 'Booking confirmed!',
      booking_id,
      total_amount,
      quantity
    });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  } finally {
    conn.release();
  }
});

router.get('/my', async (req, res) => {
  const user_id = req.session.userId || req.query.user_id;

  if (!user_id) {
    return res.status(401).json({ error: 'Please log in.' });
  }

  try {
    const [bookings] = await db.execute(`
      SELECT b.booking_id AS id, b.quantity, b.total_amount,
             b.booking_status AS status, b.booking_date AS created_at,
             e.event_title AS event_title, e.event_date,
             sc.category_name AS sport,
             v.venue_name AS venue, v.city
      FROM bookings b
      JOIN events e ON b.event_id = e.event_id
      JOIN sport_categories sc ON e.category_id = sc.category_id
      JOIN venues v ON e.venue_id = v.venue_id
      WHERE b.user_id = ?
      ORDER BY b.booking_date DESC
    `, [user_id]);

    res.json(bookings);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch your bookings.' });
  }
});
// PUT /api/bookings/:id/cancel
router.put('/:id/cancel', async (req, res) => {
  const booking_id = req.params.id;
  const user_id = req.session.userId || req.query.user_id;

  if (!user_id) {
    return res.status(401).json({ error: 'Please log in.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Get the booking first — make sure it belongs to this user
    const [rows] = await conn.execute(
      'SELECT * FROM bookings WHERE booking_id = ? AND user_id = ?',
      [booking_id, user_id]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Booking not found.' });
    }

    const booking = rows[0];

    if (booking.booking_status === 'Cancelled') {
      await conn.rollback();
      return res.status(400).json({ error: 'Booking is already cancelled.' });
    }

    // Update booking status to Cancelled
    await conn.execute(
      'UPDATE bookings SET booking_status = ? WHERE booking_id = ?',
      ['Cancelled', booking_id]
    );

    // Restore the seats back to the event
    await conn.execute(
      'UPDATE events SET available_seats = available_seats + ? WHERE event_id = ?',
      [booking.quantity, booking.event_id]
    );

    // Update tickets status to Cancelled
    await conn.execute(
      'UPDATE tickets SET ticket_status = ? WHERE booking_id = ?',
      ['Cancelled', booking_id]
    );
// Record payment
    await conn.execute(
      'INSERT INTO payments (booking_id, amount, status, method) VALUES (?, ?, ?, ?)',
      [booking_id, total_amount, 'completed', 'card']
    );

    
    await conn.commit();

    res.json({ message: 'Booking cancelled successfully.' });

  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Could not cancel booking.' });
  } finally {
    conn.release();
  }
});
module.exports = router;