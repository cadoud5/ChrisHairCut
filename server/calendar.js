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

// Get all events between two dates (used for availability blocking)
async function getEvents(timeMin, timeMax) {
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  return res.data.items || [];
}

module.exports = { createEvent, deleteEvent, getEvents };