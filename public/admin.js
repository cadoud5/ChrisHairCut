const API = '';

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

    const paidBox = b.status === 'completed' ? `
      <div class="paid-box">
        <label for="paid-${b.id}">Paid</label>
        <input type="text" id="paid-${b.id}" placeholder="$0.00"
               value="${b.paid_amount || ''}"
               onchange="savePaid(${b.id}, this.value)" />
        <span class="paid-saved" id="paid-saved-${b.id}">Saved</span>
      </div>
    ` : '';

    return `
      <tr id="row-${b.id}">
        <td>${b.name}</td>
        <td>${b.service}</td>
        <td>${date}</td>
        <td>${b.price}</td>
        <td>${b.phone}<br><span style="color:#9a9187">${b.email}</span></td>
        <td>
          <select class="status-select status-${b.status}" onchange="updateStatus(${b.id}, this.value)">
            <option value="pending"   ${b.status === 'pending'   ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          ${paidBox}
        </td>
        <td>
          <button class="delete-btn" onclick="deleteBooking(${b.id}, '${b.name.replace(/'/g, "\\'")}')" aria-label="Delete booking">
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

    return `
      <div class="review-mod-item">
        <div>
          <div class="stars">${stars}${statusBadge}</div>
          ${r.comment ? `<p class="comment">"${r.comment}"</p>` : '<p class="comment" style="color:#9a9187;">No comment left.</p>'}
          <div class="meta">${r.customer_name} · ${r.service || 'Unknown service'} · ${date}</div>
        </div>
        <div class="review-mod-actions">
          ${r.approved
            ? `<button class="hide-btn" onclick="toggleReviewApproval(${r.id}, false)">Hide</button>`
            : `<button class="approve-btn" onclick="toggleReviewApproval(${r.id}, true)">Approve</button>`
          }
          <button class="delete-review-btn" onclick="deleteReview(${r.id})">Delete</button>
        </div>
      </div>
    `;
  }).join('');
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