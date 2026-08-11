const dayMap = ['sun','mon','tue','wed','thu','fri','sat'];
const todayKey = dayMap[new Date().getDay()];
const row = document.getElementById('row-' + todayKey);
if (row) row.classList.add('today');

const d = new Date();
const dateStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
document.getElementById('m-date').min = dateStr;

function switchTab(tab) {
  document.getElementById('tab-services').classList.toggle('active', tab === 'services');
  document.getElementById('tab-staff').classList.toggle('active', tab === 'staff');
  document.getElementById('panel-services').classList.toggle('hidden', tab !== 'services');
  document.getElementById('panel-staff').classList.toggle('visible', tab === 'staff');
}

function openModal(service) {
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalForm').classList.remove('hidden');
  document.getElementById('modalSuccess').classList.remove('visible');
  document.getElementById('postBookingAccountPrompt').style.display = 'none';
  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Confirm Booking Request';
  btn.disabled = false;

  const rawUser = localStorage.getItem('customer_user');
  if (rawUser) {
    try {
      const user = JSON.parse(rawUser);
      const [first, ...rest] = user.name.split(' ');
      document.getElementById('m-fname').value = first || '';
      document.getElementById('m-lname').value = rest.join(' ') || '';
      document.getElementById('m-email').value = user.email || '';
      document.getElementById('m-phone').value = user.phone || '';
    } catch (e) {}
  }

  if (service) {
    const sel = document.getElementById('m-service');
    Array.from(sel.options).forEach(o => {
      if (o.text.startsWith(service)) sel.value = o.value;
    });
  }
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function timeTo24hr(t) {
  const [time, modifier] = t.split(' ');
  let [hours, minutes] = time.split(':');
  hours = parseInt(hours);
  if (modifier === 'PM' && hours !== 12) hours += 12;
  if (modifier === 'AM' && hours === 12) hours = 0;
  return String(hours).padStart(2,'0') + ':' + minutes + ':00';
}

document.getElementById('m-date').addEventListener('change', async function() {
  const selected = this.value;
  const timeSelect = document.getElementById('m-time');

  Array.from(timeSelect.options).forEach(opt => {
    if (opt.value === '') return;
    opt.disabled = true;
    opt.text = opt.text.replace(' — unavailable', '') + ' — checking…';
  });

  try {
    const dayStart = selected + 'T00:00:00-05:00';
    const dayEnd   = selected + 'T23:59:59-05:00';

    const res = await fetch(`/api/bookings/availability?start=${encodeURIComponent(dayStart)}&end=${encodeURIComponent(dayEnd)}`);
    const busySlots = await res.json();

    Array.from(timeSelect.options).forEach(opt => {
      if (opt.value === '') return;
      const cleanText = opt.text.replace(' — checking…', '').replace(' — unavailable', '');
      const slotStart = new Date(selected + 'T' + timeTo24hr(cleanText) + '-05:00');
      const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

      const isBusy = busySlots.some(busy => {
        const busyStart = new Date(busy.start);
        const busyEnd = new Date(busy.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });

      opt.disabled = isBusy;
      opt.text = isBusy ? cleanText + ' — unavailable' : cleanText;
    });

  } catch (err) {
    console.error('Failed to fetch availability:', err);
    Array.from(timeSelect.options).forEach(opt => {
      if (opt.value === '') return;
      opt.disabled = false;
      opt.text = opt.text.replace(' — checking…', '').replace(' — unavailable', '');
    });
  }

  timeSelect.value = '';
});

async function submitForm(e) {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  btn.textContent = 'Confirming...';
  btn.disabled = true;

  const prices = {
    'Mens Haircut — $17.00 · 30 min': '$17.00',
    'Buzzcut — $10.00 · 30 min': '$10.00',
    'UIC Student — $13.00 · 30 min': '$13.00',
  };

  const rawDate = document.getElementById('m-date').value;
  const rawTimeRaw = document.getElementById('m-time').value;
  const rawTime = rawTimeRaw.replace(' — unavailable', '').replace(' — checking…', '');

  const startDateTime = rawDate + 'T' + timeTo24hr(rawTime) + '-05:00';
  const endHour = String(parseInt(timeTo24hr(rawTime).slice(0,2)) + 1).padStart(2,'0');
  const endDateTime = rawDate + 'T' + endHour + ':' + timeTo24hr(rawTime).slice(3) + '-05:00';

  const name = document.getElementById('m-fname').value.trim() + ' ' + document.getElementById('m-lname').value.trim();
  const phone = document.getElementById('m-phone').value.trim();
  const email = document.getElementById('m-email').value.trim();
  const service = document.getElementById('m-service').value;
  const price = prices[service] || 'N/A';
  const notes = document.getElementById('m-notes').value.trim() || 'None';

  try {
    const token = localStorage.getItem('customer_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name, phone, email, service, price,
        startDate: startDateTime,
        endDate: endDateTime,
        notes,
      })
    });

    if (!res.ok) throw new Error('Booking failed');

    document.getElementById('modalForm').classList.add('hidden');
    document.getElementById('modalSuccess').classList.add('visible');

    // If this booking was made as a guest, offer to create an account
    const promptEl = document.getElementById('postBookingAccountPrompt');
    if (!token) {
      lastGuestBookingInfo = { name, email, phone };
      promptEl.style.display = 'block';
    } else {
      promptEl.style.display = 'none';
    }

  } catch(err) {
    console.error(err);
    btn.textContent = 'Confirm Booking Request';
    btn.disabled = false;
    alert('Something went wrong. Please email chrishaircut07@gmail.com to book your appointment. Sorry for the inconvenience.');
  }
}

//HTML-escaping (previously public/escape.js)
// Any user-supplied value (names, review comments, service labels, etc.)
// must be passed through this before being inserted into innerHTML.
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}




// Stores the guest's info temporarily so we can pre-fill the signup form
// if they choose to create an account right after booking
let lastGuestBookingInfo = null;

function openAccountPromptSignup() {
  closeModal();
  openAuthModal();
  switchAuthTab('signup');

  if (lastGuestBookingInfo) {
    const [first, ...rest] = lastGuestBookingInfo.name.split(' ');
    document.getElementById('signup-fname').value = first || '';
    document.getElementById('signup-lname').value = rest.join(' ') || '';
    document.getElementById('signup-email').value = lastGuestBookingInfo.email || '';
    document.getElementById('signup-phone').value = lastGuestBookingInfo.phone || '';
  }
}

function updateTopnavExpandedState() {
  const topnav = document.querySelector('.topnav');
  if (!topnav) return;
  if (window.scrollY <= 0) {
    topnav.classList.add('top-expanded');
  } else {
    topnav.classList.remove('top-expanded');
  }
}

window.addEventListener('scroll', updateTopnavExpandedState);
window.addEventListener('load', updateTopnavExpandedState);

// ─────────────────────────────────────────
// CUSTOMER AUTH
// ─────────────────────────────────────────
function getCustomerToken() { return localStorage.getItem('customer_token'); }
function saveCustomerToken(token) { localStorage.setItem('customer_token', token); }
function getCustomerUser() {
  const raw = localStorage.getItem('customer_user');
  return raw ? JSON.parse(raw) : null;
}
function saveCustomerUser(user) { localStorage.setItem('customer_user', JSON.stringify(user)); }
function clearCustomerSession() {
  localStorage.removeItem('customer_token');
  localStorage.removeItem('customer_user');
}

function updateAccountButton() {
  const label = document.getElementById('accountBtnLabel');
  const user = getCustomerUser();
  if (user && getCustomerToken()) {
    label.textContent = user.name.split(' ')[0];
  } else {
    label.textContent = 'Sign In';
  }
}

function openAuthModal() {
  document.getElementById('authModalOverlay').classList.add('open');
  const user = getCustomerUser();
  if (user && getCustomerToken()) {
    document.getElementById('acctSettingsView').style.display = 'none';
    document.getElementById('acctMainView').style.display = 'block';
    showAccountPanel();
  } else {
    document.getElementById('authLoggedOut').style.display = 'block';
    document.getElementById('authLoggedIn').classList.remove('active');
  }
}

function closeAuthModal() {
  document.getElementById('authModalOverlay').classList.remove('open');
}

function switchAuthTab(tab) {
  document.getElementById('authTabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authTabSignup').classList.toggle('active', tab === 'signup');
  document.getElementById('authPanelLogin').classList.toggle('active', tab === 'login');
  document.getElementById('authPanelSignup').classList.toggle('active', tab === 'signup');
}

async function customerLogin(e) {
  e.preventDefault();
  const errorEl = document.getElementById('loginErrorMsg');
  errorEl.style.display = 'none';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Login failed';
      errorEl.style.display = 'block';
      return;
    }

    saveCustomerToken(data.token);
    saveCustomerUser(data.user);

    if (data.user.role === 'admin') {
      localStorage.setItem('admin_token', data.token);
    }

    updateAccountButton();
    showAccountPanel();
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

async function customerSignup(e) {
  e.preventDefault();
  const errorEl = document.getElementById('signupErrorMsg');
  errorEl.style.display = 'none';

  const fname = document.getElementById('signup-fname').value.trim();
  const lname = document.getElementById('signup-lname').value.trim();
  const name = fname + ' ' + lname;
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value;

  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Signup failed';
      errorEl.style.display = 'block';
      return;
    }

    saveCustomerToken(data.token);
    saveCustomerUser(data.user);
    updateAccountButton();
    showAccountPanel();
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

function customerLogout() {
  clearCustomerSession();
  localStorage.removeItem('admin_token');
  updateAccountButton();
  closeAuthModal();
}

// ─────────────────────────────────────────
// ACCOUNT SETTINGS
// ─────────────────────────────────────────
function openSettingsView() {
  const user = getCustomerUser();
  if (!user) return;

  const [first, ...rest] = user.name.split(' ');
  document.getElementById('settings-fname').value = first || '';
  document.getElementById('settings-lname').value = rest.join(' ') || '';
  document.getElementById('settings-email').value = user.email || '';
  document.getElementById('settings-phone').value = user.phone || '';

  document.getElementById('settings-current-password').value = '';
  document.getElementById('settings-new-password').value = '';
  document.getElementById('settingsErrorMsg').style.display = 'none';
  document.getElementById('settingsSuccessMsg').style.display = 'none';
  document.getElementById('deleteConfirmBox').style.display = 'none';
  document.getElementById('deleteErrorMsg').style.display = 'none';

  document.getElementById('acctMainView').style.display = 'none';
  document.getElementById('acctSettingsView').style.display = 'block';
}

function closeSettingsView() {
  document.getElementById('acctSettingsView').style.display = 'none';
  document.getElementById('acctMainView').style.display = 'block';
}

async function updateAccountInfo(e) {
  e.preventDefault();
  const errorEl = document.getElementById('settingsErrorMsg');
  const successEl = document.getElementById('settingsSuccessMsg');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  const fname = document.getElementById('settings-fname').value.trim();
  const lname = document.getElementById('settings-lname').value.trim();
  const name = fname + ' ' + lname;
  const email = document.getElementById('settings-email').value.trim();
  const phone = document.getElementById('settings-phone').value.trim();

  try {
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getCustomerToken()
      },
      body: JSON.stringify({ name, email, phone })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to update account';
      errorEl.style.display = 'block';
      return;
    }

    saveCustomerUser(data);
    updateAccountButton();
    document.getElementById('acctName').textContent = data.name;
    document.getElementById('acctEmail').textContent = data.email;

    successEl.textContent = 'Account updated successfully.';
    successEl.style.display = 'block';
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

async function changePassword(e) {
  e.preventDefault();
  const errorEl = document.getElementById('settingsErrorMsg');
  const successEl = document.getElementById('settingsSuccessMsg');
  errorEl.style.display = 'none';
  successEl.style.display = 'none';

  const currentPassword = document.getElementById('settings-current-password').value;
  const newPassword = document.getElementById('settings-new-password').value;

  if (!currentPassword || !newPassword) {
    errorEl.textContent = 'Both password fields are required to change your password.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getCustomerToken()
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to update password';
      errorEl.style.display = 'block';
      return;
    }

    document.getElementById('settings-current-password').value = '';
    document.getElementById('settings-new-password').value = '';

    successEl.textContent = 'Password updated successfully.';
    successEl.style.display = 'block';
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

function openDeleteConfirm() {
  document.getElementById('deleteConfirmBox').style.display = 'block';
}

async function confirmDeleteAccount() {
  const errorEl = document.getElementById('deleteErrorMsg');
  errorEl.style.display = 'none';

  const password = document.getElementById('delete-password').value;
  if (!password) {
    errorEl.textContent = 'Please enter your password to confirm.';
    errorEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getCustomerToken()
      },
      body: JSON.stringify({ password })
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to delete account';
      errorEl.style.display = 'block';
      return;
    }

    clearCustomerSession();
    localStorage.removeItem('admin_token');
    updateAccountButton();
    closeAuthModal();
    alert('Your account has been deleted.');
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

// ─────────────────────────────────────────
// REVIEWS (customer side)
// ─────────────────────────────────────────
let currentReviewBookingId = null;
let currentReviewRating = 0;
let currentReviewPhotoFile = null;

function openReviewView(bookingId, serviceName) {
  currentReviewBookingId = bookingId;
  currentReviewRating = 0;
  currentReviewPhotoFile = null;

  document.getElementById('reviewServiceLabel').textContent = serviceName;
  document.getElementById('review-comment').value = '';
  document.getElementById('reviewErrorMsg').style.display = 'none';
  document.getElementById('review-photo-input').value = '';
  document.getElementById('photoPreviewWrap').style.display = 'none';
  document.getElementById('photoUploadPrompt').style.display = 'flex';
  renderStars(0);

  document.getElementById('acctMainView').style.display = 'none';
  document.getElementById('acctReviewView').style.display = 'block';
}

function closeReviewView() {
  document.getElementById('acctReviewView').style.display = 'none';
  document.getElementById('acctMainView').style.display = 'block';
}

function renderStars(rating) {
  document.querySelectorAll('#starRating .star').forEach(star => {
    const val = parseInt(star.getAttribute('data-value'));
    star.classList.toggle('active', val <= rating);
  });
}

const starRatingEl = document.getElementById('starRating');
if (starRatingEl) {
  starRatingEl.addEventListener('click', (e) => {
    if (!e.target.classList.contains('star')) return;
    currentReviewRating = parseInt(e.target.getAttribute('data-value'));
    renderStars(currentReviewRating);
  });
}

function handlePhotoSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert('Photo must be under 5MB.');
    e.target.value = '';
    return;
  }

  currentReviewPhotoFile = file;

  const reader = new FileReader();
  reader.onload = function(evt) {
    document.getElementById('photoPreviewImg').src = evt.target.result;
    document.getElementById('photoPreviewWrap').style.display = 'block';
    document.getElementById('photoUploadPrompt').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removeSelectedPhoto() {
  currentReviewPhotoFile = null;
  document.getElementById('review-photo-input').value = '';
  document.getElementById('photoPreviewWrap').style.display = 'none';
  document.getElementById('photoUploadPrompt').style.display = 'flex';
}

async function submitReview() {
  const errorEl = document.getElementById('reviewErrorMsg');
  errorEl.style.display = 'none';

  if (currentReviewRating === 0) {
    errorEl.textContent = 'Please select a star rating.';
    errorEl.style.display = 'block';
    return;
  }

  const comment = document.getElementById('review-comment').value.trim();

  const formData = new FormData();
  formData.append('bookingId', currentReviewBookingId);
  formData.append('rating', currentReviewRating);
  formData.append('comment', comment);
  if (currentReviewPhotoFile) {
    formData.append('photo', currentReviewPhotoFile);
  }

  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + getCustomerToken()
      },
      body: formData
    });
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.error || 'Failed to submit review';
      errorEl.style.display = 'block';
      return;
    }

    closeReviewView();
    showAccountPanel();
    alert('Thanks for your review!');
  } catch (err) {
    errorEl.textContent = 'Something went wrong. Try again.';
    errorEl.style.display = 'block';
  }
}

async function deleteMyReview(reviewId) {
  const confirmed = confirm('Delete your review? This cannot be undone.');
  if (!confirmed) return;

  try {
    const res = await fetch('/api/reviews/mine/' + reviewId, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getCustomerToken() }
    });

    if (!res.ok) throw new Error('Failed to delete');

    showAccountPanel();
  } catch (err) {
    alert('Failed to delete review. Try again.');
  }
}

// ─────────────────────────────────────────
// ACCOUNT PANEL (bookings + reviews together)
// ─────────────────────────────────────────
async function showAccountPanel() {
  document.getElementById('authLoggedOut').style.display = 'none';
  document.getElementById('authLoggedIn').classList.add('active');

  const user = getCustomerUser();
  document.getElementById('acctName').textContent = user.name;
  document.getElementById('acctEmail').textContent = user.email;

  const listEl = document.getElementById('acctBookingsList');
  const bookingsHeading = document.getElementById('acctBookingsHeading');

  if (user.role === 'admin') {
    if (bookingsHeading) bookingsHeading.textContent = 'Admin';
    listEl.innerHTML = `
      <a href="/admin.html" class="auth-submit" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box;">
        Go to Admin Dashboard
      </a>
    `;
    return;
  }

  if (bookingsHeading) bookingsHeading.textContent = 'My Bookings';
  listEl.innerHTML = '<p style="font-size:12px;color:#9a9187;">Loading…</p>';

  try {
    const res = await fetch('/api/bookings/mine?t=' + Date.now(), {
      headers: { 'Authorization': 'Bearer ' + getCustomerToken() },
      cache: 'no-store'
    });

    if (res.status === 401) {
      clearCustomerSession();
      updateAccountButton();
      document.getElementById('authLoggedOut').style.display = 'block';
      document.getElementById('authLoggedIn').classList.remove('active');
      return;
    }

    const bookings = await res.json();

    if (bookings.length === 0) {
      listEl.innerHTML = '<p style="font-size:12px;color:#9a9187;">No bookings yet.</p>';
      return;
    }

    // Fetch reviewable bookings (completed, no review yet)
    let reviewableIds = new Set();
    try {
      const reviewableRes = await fetch('/api/reviews/reviewable?t=' + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + getCustomerToken() },
        cache: 'no-store'
      });
      if (reviewableRes.ok) {
        const reviewable = await reviewableRes.json();
        reviewableIds = new Set(reviewable.map(b => b.id));
      }
    } catch (e) {}

    // Fetch the customer's own reviews so we can show a delete option
    let myReviewsByBooking = {};
    try {
      const myReviewsRes = await fetch('/api/reviews/mine?t=' + Date.now(), {
        headers: { 'Authorization': 'Bearer ' + getCustomerToken() },
        cache: 'no-store'
      });
      if (myReviewsRes.ok) {
        const myReviews = await myReviewsRes.json();
        myReviews.forEach(r => { myReviewsByBooking[r.booking_id] = r; });
      }
    } catch (e) {}

    listEl.innerHTML = bookings.map(b => {
      const date = new Date(b.start_date).toLocaleString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago'
      });

      const showReviewBtn = reviewableIds.has(b.id);
      const existingReview = myReviewsByBooking[b.id];
      const safeService = escapeHtml(b.service);

      let reviewBlock = '';
      if (showReviewBtn) {
        // Use data-* attributes instead of inline onclick with interpolated
        // strings — avoids any HTML/JS-string escaping edge cases.
        reviewBlock = `<button class="r-review-btn" data-action="open-review" data-booking-id="${b.id}" data-service="${safeService}">Leave a Review</button>`;
      } else if (existingReview) {
        const stars = '★'.repeat(existingReview.rating) + '☆'.repeat(5 - existingReview.rating);
        reviewBlock = `
          <div class="my-review-block">
            <span class="my-review-stars">${stars}</span>
            <button class="r-delete-review-btn" data-action="delete-my-review" data-review-id="${existingReview.id}">Delete Review</button>
          </div>
        `;
      }

      return `
        <div class="account-booking-item">
          <div class="b-service">${safeService}</div>
          <div class="b-date">${date}</div>
          <div class="b-status-row">
            <span class="b-status b-status-${b.status}">${b.status}</span>
            ${reviewBlock}
          </div>
        </div>
      `;
    }).join('');

    // Wire up buttons rendered above (data attributes are already HTML-decoded
    // by the browser, so no further escaping/parsing of untrusted text happens here).
    listEl.querySelectorAll('[data-action="open-review"]').forEach(btn => {
      btn.addEventListener('click', () => {
        openReviewView(Number(btn.dataset.bookingId), btn.dataset.service);
      });
    });
    listEl.querySelectorAll('[data-action="delete-my-review"]').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteMyReview(Number(btn.dataset.reviewId));
      });
    });
  } catch (err) {
    listEl.innerHTML = '<p style="font-size:12px;color:#9a9187;">Failed to load bookings.</p>';
  }
}

updateAccountButton();

// ─────────────────────────────────────────
// PUBLIC REVIEWS DISPLAY (homepage)
// ─────────────────────────────────────────
async function loadPublicReviews() {
  const grid = document.getElementById('reviewsGrid');
  if (!grid) return;
  try {
    const res = await fetch('/api/reviews');
    const reviews = await res.json();

    if (!res.ok || reviews.length === 0) {
      grid.innerHTML = '<p class="reviews-empty">No reviews yet. Be the first!</p>';
      return;
    }

    grid.innerHTML = reviews.map(r => {
      const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
      const date = new Date(r.created_at).toLocaleDateString('en-US', {
        month: 'short', year: 'numeric'
      });
      const safeName = escapeHtml(r.customer_name);
      const safeComment = escapeHtml(r.comment);
      const safePhoto = escapeHtml(r.photo_url);
      return `
        <div class="review-card">
          ${r.photo_url ? `<img src="${safePhoto}" class="review-card-photo" alt="Photo from ${safeName}'s review" />` : ''}
          <div class="review-stars">${stars}</div>
          ${r.comment ? `<p class="review-comment">"${safeComment}"</p>` : ''}
          <div class="review-meta">
            <span>${safeName}</span>
            <span>${date}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    grid.innerHTML = '<p class="reviews-empty">Failed to load reviews.</p>';
  }
}

loadPublicReviews();
