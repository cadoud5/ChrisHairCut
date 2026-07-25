const cron = require('node-cron');
const pool = require('../db');
const { sendEmail } = require('../emails/mailer');

function readableDate(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
  });
}

async function sendReminders() {
  console.log('[reminders] checking for appointments 24hrs out...');

  try {
    // Find bookings starting between 23.5 and 24.5 hours from now
    // (1 hour window since this job runs hourly)
    const result = await pool.query(
      `SELECT * FROM bookings
       WHERE status IN ('pending', 'confirmed')
         AND reminder_sent = false
         AND start_date BETWEEN NOW() + INTERVAL '23 hours 30 minutes'
                             AND NOW() + INTERVAL '24 hours 30 minutes'`
    );

    if (result.rows.length === 0) {
      console.log('[reminders] no appointments to remind');
      return;
    }

    for (const booking of result.rows) {
      const dateStr = readableDate(booking.start_date);

      // Email customer
      await sendEmail({
        to: booking.email,
        subject: `Reminder: Your appointment tomorrow — ${dateStr}`,
        html: `
          <h2>Appointment Reminder</h2>
          <p>Hi ${booking.name},</p>
          <p>Just a reminder that you have an appointment <strong>tomorrow</strong>:</p>
          <ul>
            <li><strong>Service:</strong> ${booking.service}</li>
            <li><strong>Date:</strong> ${dateStr}</li>
            <li><strong>Price:</strong> ${booking.price}</li>
          </ul>
          <p>See you then! Questions? Text or call 773.314.0148.</p>
        `
      });

      // Email yourself
      await sendEmail({
        to: process.env.GMAIL_USER,
        subject: `Reminder: ${booking.name} appointment tomorrow`,
        html: `
          <h2>Upcoming appointment tomorrow</h2>
          <ul>
            <li><strong>Name:</strong> ${booking.name}</li>
            <li><strong>Phone:</strong> ${booking.phone}</li>
            <li><strong>Email:</strong> ${booking.email}</li>
            <li><strong>Service:</strong> ${booking.service}</li>
            <li><strong>Date:</strong> ${dateStr}</li>
            <li><strong>Price:</strong> ${booking.price}</li>
            <li><strong>Notes:</strong> ${booking.notes || 'None'}</li>
          </ul>
        `
      });

      // Mark as reminded so we never send it twice
      await pool.query('UPDATE bookings SET reminder_sent = true WHERE id = $1', [booking.id]);

      console.log(`[reminders] sent reminder for booking #${booking.id} (${booking.name})`);
    }

  } catch (err) {
    console.error('[reminders] error:', err);
  }
}

function startReminderCron() {
  // Runs every hour, only between 11am–7pm Central (your business hours)
  cron.schedule('0 11-19 * * *', sendReminders, {
    timezone: 'America/Chicago'
  });
  console.log('[reminders] cron scheduled — runs hourly 11am-7pm Central');
}

module.exports = { startReminderCron, sendReminders };