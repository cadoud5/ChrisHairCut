require('dotenv').config();
const app = require('./app');
const { startReminderCron } = require('./cron/reminders');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startReminderCron();
});