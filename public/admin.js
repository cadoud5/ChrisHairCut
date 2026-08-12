const API = '';

// HTML-escaping helper — any user-supplied value (names, review comments,
// service labels, etc.) must be passed through this before being inserted
// into innerHTML.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getToken() { return localStorage.getItem('admin_token'); }
function clearToken() {
  localStorage.removeItem('admin_token');
  localStorage.removeItem('customer_token');
  localStorage.removeItem('customer_user');
}

function logout() {
  clearToken();
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('loginWrap').style.display = 'flex';
}

async function showDashboard() {
  document.getElementById('loginWrap').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  await loadBookings();
}

let bookingsCache = [];

async function loadBookings() {
  const token = getToken();
  const wrap = document.getElementById('tableWrap');

  try {
    const res = await fetch(API + '/api/bookings', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    bookingsCache = await res.json();
    renderTable();
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state">Failed to load bookings.</div>';
  }
}

function renderTable() {
  const wrap = document.getElementById('tableWrap');

  if (bookingsCache.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No bookings yet.</div>';
    return;
  }

  const rows = bookingsCache.map(b => {
    const date = new Date(b.start_date).toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
    });

    const safeName = escapeHtml(b.name);
    const safeService = escapeHtml(b.service);
    const safePhone = escapeHtml(b.phone);
    const safeEmail = escapeHtml(b.email);
    const safePrice = escapeHtml(b.price);
    const safePaid = escapeHtml(b.paid_amount || '');

    const paidBox = b.status === 'completed' ? `
      <div class="paid-box">
        <label for="paid-${b.id}">Paid</label>
        <input type="text" id="paid-${b.id}" placeholder="$0.00"
               value="${safePaid}"
               data-action="save-paid" data-booking-id="${b.id}" />
        <span class="paid-saved" id="paid-saved-${b.id}">Saved</span>
      </div>
    ` : '';

    return `
      <tr id="row-${b.id}">
        <td>${safeName}</td>
        <td>${safeService}</td>
        <td>${date}</td>
        <td>${safePrice}</td>
        <td>${safePhone}<br><span style="color:#9a9187">${safeEmail}</span></td>
        <td>
          <select class="status-select status-${b.status}" data-action="update-status" data-booking-id="${b.id}">
            <option value="pending"   ${b.status === 'pending'   ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          ${paidBox}
        </td>
        <td>
          <button class="delete-btn" data-action="delete-booking" data-booking-id="${b.id}" data-booking-name="${safeName}" aria-label="Delete booking">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M3 6h18"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Name</th><th>Service</th><th>Date & Time</th><th>Price</th><th>Contact</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // Event wiring — dataset values are already HTML-decoded plain strings,
  // so nothing here ever gets re-parsed as HTML or JS.
  wrap.querySelectorAll('[data-action="update-status"]').forEach(el => {
    el.addEventListener('change', () => {
      updateStatus(Number(el.dataset.bookingId), el.value);
    });
  });
  wrap.querySelectorAll('[data-action="save-paid"]').forEach(el => {
    el.addEventListener('change', () => {
      savePaid(Number(el.dataset.bookingId), el.value);
    });
  });
  wrap.querySelectorAll('[data-action="delete-booking"]').forEach(el => {
    el.addEventListener('click', () => {
      deleteBooking(Number(el.dataset.bookingId), el.dataset.bookingName);
    });
  });
}

async function updateStatus(id, status) {
  const token = getToken();
  try {
    const res = await fetch(API + '/api/bookings/' + id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ status })
    });

    if (!res.ok) throw new Error('Failed to update');

    const updated = await res.json();
    const idx = bookingsCache.findIndex(b => b.id === id);
    if (idx !== -1) bookingsCache[idx] = updated;
    renderTable();
  } catch (err) {
    alert('Failed to update status. Try again.');
  }
}

async function savePaid(id, paidAmount) {
  const token = getToken();
  try {
    const res = await fetch(API + '/api/bookings/' + id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ paid_amount: paidAmount })
    });

    if (!res.ok) throw new Error('Failed to update');

    const updated = await res.json();
    const idx = bookingsCache.findIndex(b => b.id === id);
    if (idx !== -1) bookingsCache[idx] = updated;

    const savedLabel = document.getElementById('paid-saved-' + id);
    if (savedLabel) {
      savedLabel.style.display = 'inline';
      setTimeout(() => savedLabel.style.display = 'none', 1500);
    }
  } catch (err) {
    alert('Failed to save payment. Try again.');
  }
}

async function deleteBooking(id, name) {
  const confirmed = confirm(`Delete the booking for ${name}? This cannot be undone.`);
  if (!confirmed) return;

  const token = getToken();
  try {
    const res = await fetch(API + '/api/bookings/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!res.ok) throw new Error('Failed to delete');

    bookingsCache = bookingsCache.filter(b => b.id !== id);
    renderTable();
  } catch (err) {
    alert('Failed to delete booking. Try again.');
  }
}

// ─────────────────────────────────────────
// ADMIN TABS
// ─────────────────────────────────────────
function switchAdminTab(tab) {
  document.getElementById('adminTabBookings').classList.toggle('active', tab === 'bookings');
  document.getElementById('adminTabReviews').classList.toggle('active', tab === 'reviews');
  document.getElementById('tableWrap').style.display = tab === 'bookings' ? 'block' : 'none';
  document.getElementById('reviewsWrap').style.display = tab === 'reviews' ? 'block' : 'none';
  document.getElementById('dashTitle').textContent = tab === 'bookings' ? 'Bookings' : 'Reviews';

  if (tab === 'reviews') loadReviews();
}

let reviewsCache = [];

async function loadReviews() {
  const token = getToken();
  const wrap = document.getElementById('reviewsWrap');
  wrap.innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const res = await fetch(API + '/api/reviews/all', {
      headers: { 'Authorization': 'Bearer ' + token },
      cache: 'no-store'
    });

    if (res.status === 401 || res.status === 403) {
      logout();
      return;
    }

    reviewsCache = await res.json();
    renderReviews();
  } catch (err) {
    wrap.innerHTML = '<div class="empty-state">Failed to load reviews.</div>';
  }
}

function renderReviews() {
  const wrap = document.getElementById('reviewsWrap');

  if (reviewsCache.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No reviews yet.</div>';
    return;
  }

  wrap.innerHTML = reviewsCache.map(r => {
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    const date = new Date(r.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const statusBadge = r.approved
      ? '<span class="review-status-badge review-status-approved">Visible</span>'
      : '<span class="review-status-badge review-status-hidden">Hidden</span>';
    const safeComment = escapeHtml(r.comment);
    const safeName = escapeHtml(r.customer_name);
    const safeService = escapeHtml(r.service || 'Unknown service');

    return `
      <div class="review-mod-item">
        <div>
          <div class="stars">${stars}${statusBadge}</div>
          ${r.comment ? `<p class="comment">"${safeComment}"</p>` : '<p class="comment" style="color:#9a9187;">No comment left.</p>'}
          <div class="meta">${safeName} · ${safeService} · ${date}</div>
        </div>
        <div class="review-mod-actions">
          ${r.approved
            ? `<button class="hide-btn" data-action="hide-review" data-review-id="${r.id}">Hide</button>`
            : `<button class="approve-btn" data-action="approve-review" data-review-id="${r.id}">Approve</button>`
          }
          <button class="delete-review-btn" data-action="delete-review" data-review-id="${r.id}">Delete</button>
        </div>
      </div>
    `;
  }).join('');

  wrap.querySelectorAll('[data-action="hide-review"]').forEach(el => {
    el.addEventListener('click', () => toggleReviewApproval(Number(el.dataset.reviewId), false));
  });
  wrap.querySelectorAll('[data-action="approve-review"]').forEach(el => {
    el.addEventListener('click', () => toggleReviewApproval(Number(el.dataset.reviewId), true));
  });
  wrap.querySelectorAll('[data-action="delete-review"]').forEach(el => {
    el.addEventListener('click', () => deleteReview(Number(el.dataset.reviewId)));
  });
}

async function toggleReviewApproval(id, approved) {
  const token = getToken();
  try {
    const res = await fetch(API + '/api/reviews/' + id, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ approved })
    });
    if (!res.ok) throw new Error('Failed');

    const updated = await res.json();
    const idx = reviewsCache.findIndex(r => r.id === id);
    if (idx !== -1) reviewsCache[idx].approved = updated.approved;
    renderReviews();
  } catch (err) {
    alert('Failed to update review. Try again.');
  }
}

async function deleteReview(id) {
  const confirmed = confirm('Delete this review? This cannot be undone.');
  if (!confirmed) return;

  const token = getToken();
  try {
    const res = await fetch(API + '/api/reviews/' + id, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Failed');

    reviewsCache = reviewsCache.filter(r => r.id !== id);
    renderReviews();
  } catch (err) {
    alert('Failed to delete review. Try again.');
  }
}

if (getToken()) {
  showDashboard();
}