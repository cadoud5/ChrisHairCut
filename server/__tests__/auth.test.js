const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Mock the DB layer so these tests never touch a real Postgres instance.
// Each test configures pool.query's mock return values for the calls
// its route handler is expected to make, in order.
jest.mock('../db');
const pool = require('../db');

const app = require('../app');

beforeEach(() => {
  pool.query.mockReset();
});

describe('POST /api/auth/signup', () => {
  test('creates a new user and returns a valid JWT', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] }) // SELECT id FROM users WHERE email = $1 (no existing user)
      .mockResolvedValueOnce({             // INSERT ... RETURNING id, name, email, phone, role
        rows: [{ id: 1, name: 'Chris', email: 'chris@example.com', phone: null, role: 'customer' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // retroactive guest-booking link UPDATE

    const res = await request(app).post('/api/auth/signup').send({
      name: 'Chris',
      email: 'chris@example.com',
      password: 'password123',
      agreedToTerms: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('chris@example.com');
    expect(res.body.user.role).toBe('customer');

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(1);
    expect(decoded.role).toBe('customer');
  });

  test('rejects signup with an email that is already registered', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // existing user found

    const res = await request(app).post('/api/auth/signup').send({
      name: 'Chris',
      email: 'chris@example.com',
      password: 'password123',
      agreedToTerms: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already registered/i);
  });

  test('rejects a password shorter than 6 characters before ever touching the DB', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Chris',
      email: 'chris@example.com',
      password: '123',
      agreedToTerms: true,
    });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects signup if Terms of Service checkbox was not checked', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Chris',
      email: 'chris@example.com',
      password: 'password123',
      agreedToTerms: false,
    });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  test('rejects signup if agreedToTerms is missing entirely', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Chris',
      email: 'chris@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(400);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/login', () => {
  test('rejects an incorrect password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, email: 'chris@example.com', password_hash: passwordHash, role: 'customer' }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'chris@example.com',
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  test('logs in successfully with the correct password', async () => {
    const passwordHash = await bcrypt.hash('correct-password', 10);
    pool.query.mockResolvedValueOnce({
      rows: [{
        id: 1, name: 'Chris', email: 'chris@example.com',
        phone: null, role: 'customer', password_hash: passwordHash,
      }],
    });

    const res = await request(app).post('/api/auth/login').send({
      email: 'chris@example.com',
      password: 'correct-password',
    });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('chris@example.com');
    expect(res.body.token).toBeTruthy();
  });

  test('returns 401 for a nonexistent email without revealing that it does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@example.com',
      password: 'whatever',
    });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });
});