const express = require('express');
const router = express.Router();
const pool = require('../db');
const { sendEmail } = require('../emails/mailer');
const { verifyToken, requireAdmin, optionalAuth } = require('../middleware/auth');
const { createEvent, deleteEvent, getEvents } = require('../calendar');

function readableDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
  });
}

router.post('/', optionalAuth, async (req, res) => {
  const { name, phone, email, service, price, startDate, endDate, notes } = req.body;
  const userId = req.user ? req.user.id : null;

  try {
    let calendarEventId = null;
    try {
      const event = await createEvent({
        summary: `${service} — ${name}`,
        description: `Phone: ${phone}\nEmail: ${email}\nPrice: ${price}\nNotes: ${notes || 'None'}`,
        startDateTime: startDate,
        endDateTime: endDate,
        location: 'UIC Roosevelt Road Building, Chicago, IL',
      });
      calendarEventId = event.id;
    } catch (calErr) {
      console.error('Calendar event creation failed:', calErr.message);
    }

    const result = await pool.query(
      `INSERT INTO bookings (name, phone, email, service, price, start_date, end_date, notes, calendar_event_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, phone, email, service, price, startDate, endDate, notes, calendarEventId, userId]
    );

    const booking = result.rows[0];
    const dateStr = readableDate(startDate);

    await sendEmail({
      to: email,
      subject: `Appointment Requested — ${dateStr}`,
      html: `
        <h2>Appointment Requested</h2>
        <p>Hi ${name},</p>
        <p>Thanks for booking! Your appointment request has been received and is <strong>pending confirmation</strong>:</p>
        <ul>
          <li><strong>Service:</strong> ${service}</li>
          <li><strong>Date:</strong> ${dateStr}</li>
          <li><strong>Price:</strong> ${price}</li>
        </ul>
        <p>You'll receive another email once Chris confirms your appointment.</p>
        <p>Questions? Text or call 773.814.5649.</p>
      `
    });

    await sendEmail({
      to: process.env.GMAIL_USER,
      subject: `New Booking Request — ${name}`,
      html: `
        <h2>New appointment requested</h2>
        <ul>
          <li><strong>Name:</strong> ${name}</li>
          <li><strong>Phone:</strong> ${phone}</li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Service:</strong> ${service}</li>
          <li><strong>Date:</strong> ${dateStr}</li>
          <li><strong>Price:</strong> ${price}</li>
          <li><strong>Notes:</strong> ${notes || 'None'}</li>
        </ul>
      `
    });

    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

router.get('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bookings ORDER BY start_date ASC');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Logged-in customer's own bookings
router.get('/mine', verifyToken, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const result = await pool.query(
      'SELECT * FROM bookings WHERE user_id = $1 ORDER BY start_date DESC',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch your bookings' });
  }
});

router.patch('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, paid_amount } = req.body;

  const allowedStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const existing = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    const before = existing.rows[0];

    const result = await pool.query(
      `UPDATE bookings
       SET status = COALESCE($1, status),
           paid_amount = COALESCE($2, paid_amount)
       WHERE id = $3
       RETURNING *`,
      [status || null, paid_amount || null, id]
    );

    const booking = result.rows[0];
    const dateStr = readableDate(booking.start_date);

    // Send status-change emails only when the status actually changed
    if (status && status !== before.status) {

      if (status === 'confirmed') {
        await sendEmail({
          to: booking.email,
          subject: `Appointment Confirmed — ${dateStr}`,
          html: `
            <h2>Appointment Confirmed!</h2>
            <p>Hi ${booking.name},</p>
            <p>Your appointment is <strong>confirmed</strong>:</p>
            <ul>
              <li><strong>Service:</strong> ${booking.service}</li>
              <li><strong>Date:</strong> ${dateStr}</li>
              <li><strong>Price:</strong> ${booking.price}</li>
            </ul>
            <p>See you then! Questions? Text or call 773.814.5649.</p>
          `
        });
      }

      if (status === 'cancelled') {
        // remove the calendar event if it exists
        if (booking.calendar_event_id) {
          try {
            await deleteEvent(booking.calendar_event_id);
          } catch (calErr) {
            console.error('Calendar event deletion failed:', calErr.message);
          }
        }

        await sendEmail({
          to: booking.email,
          subject: `Appointment Cancelled — ${dateStr}`,
          html: `
            <h2>Appointment Cancelled</h2>
            <p>Hi ${booking.name},</p>
            <p>Your appointment has been <strong>cancelled</strong>:</p>
            <ul>
              <li><strong>Service:</strong> ${booking.service}</li>
              <li><strong>Date:</strong> ${dateStr}</li>
            </ul>
            <p>If this was a mistake or you'd like to rebook, text or call 773.814.5649.</p>
          `
        });
      }
    }

    res.json(booking);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    const existing = await pool.query('SELECT calendar_event_id FROM bookings WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const eventId = existing.rows[0].calendar_event_id;
    if (eventId) {
      try {
        await deleteEvent(eventId);
      } catch (calErr) {
        console.error('Calendar event deletion failed:', calErr.message);
      }
    }

    await pool.query('DELETE FROM bookings WHERE id = $1', [id]);
    res.json({ message: 'Booking deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

router.get('/availability', async (req, res) => {
  const { start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params required' });
  }

  try {
    const events = await getEvents(start, end);
    const busySlots = events.map(e => ({
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      summary: e.summary,
    }));
    res.json(busySlots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

module.exports = router;