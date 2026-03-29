const API = 'https://traveltally-web-production.up.railway.app/api';

// ── State ──
let userPin         = localStorage.getItem('tt_pin') || '';
let activeTrip      = null;
let currentCurrency = { currName: 'JPY', symbol: '¥', ER: 0.0064 };
let todayExpenses   = [];
let activeFilter    = 'All';
let chartScope      = 'today';
const today         = new Date().toISOString().split('T')[0];

// ── Fetch with PIN header ──
async function api(path, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Pin': userPin, ...(options.headers || {}) }
  });
}

// ════════════════════════════════════════
// PIN SCREEN
// ════════════════════════════════════════
function showPinScreen() {
  document.getElementById('pin-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function showApp() {
  document.getElementById('pin-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
}

document.getElementById('pinSubmit').addEventListener('click', submitPin);
document.getElementById('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

async function submitPin() {
  const input = document.getElementById('pinInput').value.trim();
  const err   = document.getElementById('pinError');
  if (!/^[0-9]{4,8}$/.test(input)) { err.textContent = 'PIN must be 4–8 digits.'; return; }

  userPin = input;
  err.textContent = '';

  try {
    const res = await api('/trips/active');
    const data = await res.json();
    localStorage.setItem('tt_pin', userPin);
    showApp();
    if (!data.error) {
      activeTrip = data;
      currentCurrency = { currName: data.currency, symbol: data.symbol, ER: data.ER };
    }
    await initApp();
  } catch (e) {
    err.textContent = 'Could not connect to server.';
  }
}

document.getElementById('switchPin').addEventListener('click', () => {
  localStorage.removeItem('tt_pin');
  userPin = '';
  activeTrip = null;
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
  showPinScreen();
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
async function initApp() {
  document.getElementById('footerDate').textContent = formatDate(today);
  document.getElementById('ledgerDate').textContent = formatDate(today);
  updateTripBadge();
  updateNoTripBanner();
  updateCurrencyUI();

  if (activeTrip) {
    await loadTodayExpenses();
    renderLedger();
    refreshTodaySummary();
  }
}

function updateTripBadge() {
  const badge = document.getElementById('tripBadge');
  badge.textContent = activeTrip ? `✈ ${activeTrip.name}` : 'No active trip';
}

function updateNoTripBanner() {
  const banner = document.getElementById('noTripBanner');
  if (!activeTrip) banner.classList.add('visible');
  else banner.classList.remove('visible');
}

// ════════════════════════════════════════
// NAV
// ════════════════════════════════════════
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + tab.dataset.view).classList.add('active');
    if (tab.dataset.view === 'trips')  renderTripsView();
    if (tab.dataset.view === 'days')   renderDays();
    if (tab.dataset.view === 'charts') renderChart();
  });
});

document.getElementById('goStartTrip').addEventListener('click', () => {
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('[data-view="trips"]').classList.add('active');
  document.getElementById('view-trips').classList.add('active');
  renderTripsView();
});

// ════════════════════════════════════════
// CURRENCY
// ════════════════════════════════════════
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.name === 'custom') {
      document.getElementById('customFields').classList.add('visible');
    } else {
      document.getElementById('customFields').classList.remove('visible');
      applyCurrency(btn.dataset.name, btn.dataset.symbol, parseFloat(btn.dataset.rate));
    }
  });
});

document.getElementById('setCustomBtn').addEventListener('click', () => {
  const name   = document.getElementById('custCode').value.trim().toUpperCase();
  const symbol = document.getElementById('custSymbol').value.trim();
  const rate   = parseFloat(document.getElementById('custRate').value);
  if (!name || !symbol || isNaN(rate) || rate <= 0) { flash(document.getElementById('addFeedback'), '⚠ Fill in all fields.', '#c0504a'); return; }
  applyCurrency(name, symbol, rate);
  document.getElementById('customFields').classList.remove('visible');
});

async function applyCurrency(name, symbol, rate) {
  if (!activeTrip) return;
  try {
    const res = await api('/currency', { method: 'POST', body: JSON.stringify({ currName: name, symbol, ER: rate }) });
    const curr = await res.json();
    currentCurrency = { currName: curr.currName, symbol: curr.symbol, ER: curr.ER };
    updateCurrencyUI();
    updatePreview();
  } catch (e) { console.error('Currency failed', e); }
}

function updateCurrencyUI() {
  const { currName, symbol, ER } = currentCurrency;
  const statusText = document.getElementById('statusText');
  if (activeTrip) {
    statusText.textContent = `${currName} — 1 ${symbol} = $${Number(ER).toFixed(4)}`;
  } else {
    statusText.textContent = 'Start a trip to set currency';
  }
  document.getElementById('currLabel').textContent = `in ${currName} (${symbol})`;
  document.getElementById('sumForeignLabel').textContent = `${currName} today`;
}

document.getElementById('costInput').addEventListener('input', updatePreview);
function updatePreview() {
  const amount = parseFloat(document.getElementById('costInput').value);
  const preview = document.getElementById('usdPreview');
  if (!isNaN(amount) && amount > 0) {
    preview.textContent = `≈ $${(amount * currentCurrency.ER).toFixed(2)}`;
    preview.style.opacity = '1';
  } else {
    preview.textContent = '≈ $0.00';
    preview.style.opacity = '0.4';
  }
}

// ════════════════════════════════════════
// TRIPS VIEW
// ════════════════════════════════════════
async function renderTripsView() {
  renderActiveTripCard();

  try {
    const res   = await api('/trips');
    const trips = await res.json();
    const past  = trips.filter(t => !t.active);
    const container = document.getElementById('pastTripsList');

    if (past.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📦</span><p>No past trips yet.</p></div>';
      return;
    }

    container.innerHTML = past.map(t => `
      <div class="past-trip-row">
        <div>
          <div class="past-trip-name">${t.name}</div>
          <div class="past-trip-dates">${formatDate(t.startDate)} → ${t.endDate ? formatDate(t.endDate) : 'ongoing'}</div>
        </div>
        <span>${t.transactions} purchases</span>
        <span class="past-trip-usd">$${Number(t.usdTotal).toFixed(2)}</span>
      </div>`).join('');
  } catch (e) { console.error('Trips load failed', e); }
}

function renderActiveTripCard() {
  const content = document.getElementById('activeTripContent');
  if (!activeTrip) {
    content.innerHTML = '<div class="empty-state"><span class="empty-icon">🗺</span><p>No active trip.<br>Start one below.</p></div>';
    return;
  }
  content.innerHTML = `
    <div class="trip-name-display">${activeTrip.name}</div>
    <div class="active-trip-info">
      <div class="trip-stat">
        <span class="trip-stat-val">${activeTrip.currency} ${activeTrip.symbol}</span>
        <span class="trip-stat-label">Currency</span>
      </div>
      <div class="trip-stat">
        <span class="trip-stat-val">${activeTrip.transactions}</span>
        <span class="trip-stat-label">Purchases</span>
      </div>
      <div class="trip-stat">
        <span class="trip-stat-val">$${Number(activeTrip.usdTotal).toFixed(2)}</span>
        <span class="trip-stat-label">USD Total</span>
      </div>
    </div>
    <p style="font-size:11px;color:var(--text-muted);margin-bottom:1rem">Started ${formatDate(activeTrip.startDate)}</p>
    <button class="btn-danger" id="endTripBtn">End Trip</button>`;

  document.getElementById('endTripBtn').addEventListener('click', endTrip);
}

document.getElementById('startTripBtn').addEventListener('click', startTrip);

async function startTrip() {
  const name    = document.getElementById('tripName').value.trim();
  const currName = document.getElementById('tripCurrName').value.trim().toUpperCase() || 'JPY';
  const symStr  = document.getElementById('tripSymbol').value.trim();
  const symbol  = symStr || '¥';
  const rate    = parseFloat(document.getElementById('tripRate').value) || 0.0064;
  const fb      = document.getElementById('tripFeedback');

  if (!name) { flash(fb, '⚠ Enter a trip name.', '#c0504a'); return; }

  try {
    const res  = await api('/trips/start', { method: 'POST', body: JSON.stringify({ name, currName, symbol, ER: rate }) });
    const trip = await res.json();
    activeTrip = trip;
    currentCurrency = { currName: trip.currency, symbol: trip.symbol, ER: trip.ER };

    document.getElementById('tripName').value    = '';
    document.getElementById('tripCurrName').value = '';
    document.getElementById('tripSymbol').value  = '';
    document.getElementById('tripRate').value    = '';

    flash(fb, `✓ "${trip.name}" started!`, '#6a9e7f');
    updateTripBadge();
    updateNoTripBanner();
    updateCurrencyUI();
    renderActiveTripCard();
    todayExpenses = [];
    renderLedger();
    refreshTodaySummary();
  } catch (e) { flash(document.getElementById('tripFeedback'), '✗ Failed to start trip.', '#c0504a'); }
}

async function endTrip() {
  if (!confirm(`End "${activeTrip.name}"? You can still view it in history.`)) return;
  try {
    await api('/trips/end', { method: 'POST' });
    activeTrip = null;
    currentCurrency = { currName: 'JPY', symbol: '¥', ER: 0.0064 };
    todayExpenses = [];
    updateTripBadge();
    updateNoTripBanner();
    updateCurrencyUI();
    renderActiveTripCard();
    renderLedger();
    refreshTodaySummary();
    renderTripsView();
  } catch (e) { console.error('End trip failed', e); }
}

// ════════════════════════════════════════
// EXPENSES
// ════════════════════════════════════════
async function loadTodayExpenses() {
  try {
    const res = await api(`/expenses?date=${today}`);
    todayExpenses = await res.json();
  } catch (e) { todayExpenses = []; }
}

document.getElementById('addBtn').addEventListener('click', async () => {
  if (!activeTrip) { flash(document.getElementById('addFeedback'), '⚠ Start a trip first.', '#c0504a'); return; }
  const cost = parseFloat(document.getElementById('costInput').value);
  if (isNaN(cost) || cost <= 0) { flash(document.getElementById('addFeedback'), '⚠ Enter a valid amount.', '#c0504a'); return; }

  const usd         = cost * currentCurrency.ER;
  const category    = document.getElementById('categorySelect').value;
  const description = document.getElementById('descInput').value.trim();

  try {
    const res   = await api('/expense', { method: 'POST', body: JSON.stringify({ cost, usd, category, description }) });
    const saved = await res.json();
    todayExpenses.push(saved);
    document.getElementById('costInput').value = '';
    document.getElementById('descInput').value = '';
    document.getElementById('usdPreview').textContent = '≈ $0.00';
    flash(document.getElementById('addFeedback'), `✓ Recorded — $${usd.toFixed(2)}`, '#6a9e7f');
    renderLedger();
    refreshTodaySummary();
    // Refresh active trip stats
    const tripRes = await api('/trips/active');
    if (tripRes.ok) activeTrip = await tripRes.json();
  } catch (e) { flash(document.getElementById('addFeedback'), '✗ Could not reach server.', '#c0504a'); }
});

// ════════════════════════════════════════
// LEDGER
// ════════════════════════════════════════
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderLedger();
  });
});

function renderLedger() {
  const sym = currentCurrency.symbol;
  const ledger = document.getElementById('ledger');
  const filtered = activeFilter === 'All' ? todayExpenses
    : todayExpenses.filter(e => activeFilter === 'Other'
        ? !['Food','Transit','Merchandise','Lodging','Entertainment'].includes(e.category)
        : e.category === activeFilter);

  if (filtered.length === 0) {
    ledger.innerHTML = `<div class="empty-state"><span class="empty-icon">✈</span><p>${activeTrip ? (activeFilter === 'All' ? 'No expenses today.' : `No ${activeFilter} expenses today.`) : 'Start a trip to log expenses.'}</p></div>`;
    return;
  }

  ledger.innerHTML = filtered.slice().reverse().map(e => `
    <div class="entry">
      <span class="entry-cat">${e.category}</span>
      <span class="entry-desc ${e.description ? '' : 'no-desc'}">${e.description || '—'}</span>
      <span class="entry-foreign">${sym}${Number(e.cost).toLocaleString()}</span>
      <span class="entry-usd">$${Number(e.usd).toFixed(2)}</span>
    </div>`).join('');
}

function refreshTodaySummary() {
  document.getElementById('sumTransactions').textContent = todayExpenses.length;
  document.getElementById('sumForeign').textContent      = Math.round(todayExpenses.reduce((a, e) => a + e.cost, 0)).toLocaleString();
  document.getElementById('sumUsd').textContent          = `$${todayExpenses.reduce((a, e) => a + e.usd, 0).toFixed(2)}`;
}

document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!activeTrip || !confirm('Clear all expenses for today?')) return;
  try {
    await api(`/expenses?date=${today}`, { method: 'DELETE' });
    todayExpenses = [];
    renderLedger();
    refreshTodaySummary();
  } catch (e) { console.error('Clear failed', e); }
});

// ════════════════════════════════════════
// DAYS VIEW
// ════════════════════════════════════════
async function renderDays() {
  const container = document.getElementById('daysList');
  if (!activeTrip) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🗺</span><p>Start a trip to see days.</p></div>';
    return;
  }
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';
  try {
    const res  = await api('/days');
    const days = await res.json();
    if (days.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span><p>No days yet.</p></div>'; return; }
    container.innerHTML = days.map(d => `
      <div class="day-row" data-date="${d.date}">
        <span class="day-date ${d.date === today ? 'today' : ''}">${formatDate(d.date)}</span>
        <span class="day-count">${d.transactions} purchase${d.transactions !== 1 ? 's' : ''}</span>
        <span class="day-usd">$${Number(d.usdTotal).toFixed(2)}</span>
      </div>`).join('');
    container.querySelectorAll('.day-row').forEach(row => row.addEventListener('click', () => expandDay(row.dataset.date)));
  } catch (e) { container.innerHTML = '<div class="empty-state"><p>Could not load days.</p></div>'; }
}

async function expandDay(date) {
  document.getElementById('daysList').closest('.panel').style.display = 'none';
  const detail = document.getElementById('dayDetail');
  detail.style.display = 'block';
  document.getElementById('dayDetailDate').textContent = formatDate(date);
  const dl = document.getElementById('dayDetailLedger');
  dl.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';
  try {
    const res      = await api(`/expenses?date=${date}`);
    const expenses = await res.json();
    const sym      = currentCurrency.symbol;
    if (expenses.length === 0) { dl.innerHTML = '<div class="empty-state"><p>No expenses this day.</p></div>'; return; }
    dl.innerHTML = expenses.slice().reverse().map(e => `
      <div class="entry">
        <span class="entry-cat">${e.category}</span>
        <span class="entry-desc ${e.description ? '' : 'no-desc'}">${e.description || '—'}</span>
        <span class="entry-foreign">${sym}${Number(e.cost).toLocaleString()}</span>
        <span class="entry-usd">$${Number(e.usd).toFixed(2)}</span>
      </div>`).join('');
  } catch (e) { dl.innerHTML = '<div class="empty-state"><p>Could not load.</p></div>'; }
}

document.getElementById('backToDays').addEventListener('click', () => {
  document.getElementById('dayDetail').style.display = 'none';
  document.getElementById('daysList').closest('.panel').style.display = 'block';
});

// ════════════════════════════════════════
// CHARTS VIEW
// ════════════════════════════════════════
document.querySelectorAll('.scope-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.scope-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chartScope = btn.dataset.scope;
    renderChart();
  });
});

async function renderChart() {
  const container = document.getElementById('categoryChart');
  const totalsEl  = document.getElementById('chartTotals');
  if (!activeTrip) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">🗺</span><p>Start a trip to see breakdown.</p></div>';
    totalsEl.innerHTML = '';
    return;
  }

  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';
  const catUrl = chartScope === 'today' ? `/categories?date=${today}` : '/categories';
  const sumUrl = chartScope === 'today' ? `/summary?date=${today}`    : '/summary';

  try {
    const [catRes, sumRes, dayRes] = await Promise.all([api(catUrl), api(sumUrl), api('/days')]);
    const cats = await catRes.json();
    const sum  = await sumRes.json();
    const days = await dayRes.json();

    document.getElementById('chartTripName').textContent  = activeTrip.name;
    document.getElementById('allTransactions').textContent = activeTrip.transactions;
    document.getElementById('allUsd').textContent          = `$${Number(activeTrip.usdTotal).toFixed(2)}`;
    document.getElementById('allDays').textContent         = days.length;

    if (cats.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📊</span><p>No data yet.</p></div>';
      totalsEl.innerHTML = '';
      return;
    }

    const colorClass = cat => ({ Food:'food',Transit:'transit',Merchandise:'merchandise',Lodging:'lodging',Entertainment:'entertainment' }[cat] || 'other');

    container.innerHTML = cats.map(c => `
      <div class="cat-row">
        <span class="cat-name">${c.category}</span>
        <div class="cat-bar-track"><div class="cat-bar-fill ${colorClass(c.category)}" style="width:${Math.round(c.percent)}%"></div></div>
        <span class="cat-usd">$${Number(c.usd).toFixed(2)}</span>
      </div>`).join('');

    totalsEl.innerHTML = `<span>${sum.transactions} purchases</span><span>Total: <strong style="color:var(--green)">$${Number(sum.usdTotal).toFixed(2)}</strong></span>`;
  } catch (e) { container.innerHTML = '<div class="empty-state"><p>Could not load.</p></div>'; }
}

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function flash(el, msg, color) {
  el.textContent = msg; el.style.color = color; el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ════════════════════════════════════════
// BOOT
// ════════════════════════════════════════
if (userPin) {
  // Try to restore session silently
  (async () => {
    try {
      const res  = await api('/trips/active');
      const data = await res.json();
      if (!data.error) {
        activeTrip = data;
        currentCurrency = { currName: data.currency, symbol: data.symbol, ER: data.ER };
      }
      showApp();
      await initApp();
    } catch (e) { showPinScreen(); }
  })();
} else {
  showPinScreen();
}