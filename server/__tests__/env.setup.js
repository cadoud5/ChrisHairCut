// Test-only environment variables. Tests never touch a real database or
// send real email — server/db.js and server/emails/mailer.js are mocked
// in individual test files instead.
process.env.JWT_SECRET = 'test-only-secret-do-not-use-in-production';
process.env.GMAIL_USER = 'test@example.com';