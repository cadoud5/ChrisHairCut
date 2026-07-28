const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://developers.google.com/oauthplayground'
);

oauth2Client.setCredentials({
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Create a calendar event for a new booking
async function createEvent({ summary, description, startDateTime, endDateTime, location }) {
  const event = {
    summary,
    description,
    location,
    start: { dateTime: startDateTime, timeZone: 'America/Chicago' },
    end:   { dateTime: endDateTime,   timeZone: 'America/Chicago' },
  };

  const res = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return res.data;
}

// Delete a calendar event (e.g. if a booking is cancelled)
async function deleteEvent(eventId) {
  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

// Calendars to check for busy times (booking events + personal calendar)
const CALENDARS_TO_CHECK = [
  'primary',
  '2emq9q106jl92eqpr9c9rl8261s5eva8@import.calendar.google.com',
];

// Get all events between two dates across all relevant calendars
// (used for availability blocking)
async function getEvents(timeMin, timeMax) {
  const results = await Promise.all(
    CALENDARS_TO_CHECK.map(calendarId =>
      calendar.events.list({
        calendarId,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
      }).then(res => res.data.items || [])
       .catch(err => {
         console.error(`Failed to fetch events for calendar ${calendarId}:`, err.message);
         return [];
       })
    )
  );

  // Flatten all calendars' events into a single array
  return results.flat();
}

module.exports = { createEvent, deleteEvent, getEvents };