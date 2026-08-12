const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../db');
const pool = require('../db');

const app = require('../app');

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

beforeEach(() => {
  pool.query.mockReset();
});

describe('GET /api/bookings (admin-only route)', () => {
  test('rejects requests with no token', async () => {
    const res = await request(app).get('/api/bookings');
    expect(res.status).toBe(401);
  });

  test('rejects requests with a garbage/invalid token', async () => {
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('rejects a valid token belonging to a non-admin customer', async () => {
    const token = tokenFor({ id: 2, role: 'customer' });
    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
    expect(pool.query).not.toHaveBeenCalled(); // never even reaches the DB
  });

  test('allows a valid admin token through', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Booking' }] });
    const token = tokenFor({ id: 1, role: 'admin' });

    const res = await request(app)
      .get('/api/bookings')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe('GET /api/bookings/mine (customer-scoped route)', () => {
  test('only ever queries bookings for the logged-in user\'s own id', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });
    const token = tokenFor({ id: 42, role: 'customer' });

    await request(app)
      .get('/api/bookings/mine')
      .set('Authorization', `Bearer ${token}`);

    // The route must scope the query to req.user.id (42), not take an id from
    // the client — this is what prevents one customer from reading another's bookings.
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE user_id = $1'),
      [42]
    );
  });
});

describe('DELETE /api/reviews/mine/:id (ownership check)', () => {
  test('blocks a customer from deleting a review that belongs to someone else', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 5, user_id: 999, photo_url: null }], // review belongs to user 999
    });
    const token = tokenFor({ id: 42, role: 'customer' }); // request comes from user 42

    const res = await request(app)
      .delete('/api/reviews/mine/5')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});