// routes/events.js
const express = require('express');
const router = express.Router();
const db = require('../config/db');

router.get('/', async (req, res) => {
  const { sport } = req.query;
  try {
    let query = `
      SELECT e.event_id AS id, e.event_title AS title,
             e.event_date, e.event_time, e.price,
             e.available_seats, e.status,
             sc.category_name AS sport,
             v.venue_name AS venue, v.city
      FROM events e
      JOIN sport_categories sc ON e.category_id = sc.category_id
      JOIN venues v ON e.venue_id = v.venue_id
    `;
    const params = [];
    if (sport) {
      query += ' WHERE sc.category_name = ?';
      params.push(sport);
    }
    query += ' ORDER BY e.event_date ASC';
    const [events] = await db.execute(query, params);
    res.json(events);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch events.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await db.execute(`
      SELECT e.event_id AS id, e.event_title AS title,
             e.event_date, e.event_time, e.price,
             e.total_seats, e.available_seats, e.status,
             sc.category_name AS sport,
             v.venue_name AS venue, v.city, v.address, v.capacity
      FROM events e
      JOIN sport_categories sc ON e.category_id = sc.category_id
      JOIN venues v ON e.venue_id = v.venue_id
      WHERE e.event_id = ?
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Event not found.' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch event.' });
  }
});

module.exports = router;




