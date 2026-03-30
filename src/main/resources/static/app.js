const API = 'https://traveltally-web-production.up.railway.app/api';

// ── PIN ──
let userPin = localStorage.getItem('tt_pin') || '';

// ── State ──
let currentCurrency = { currName: 'JPY', symbol: '¥', ER: 0.0064 };
let todayExpenses   = [];
let activeFilter    = 'All';
let chartScope      = 'today';
const today         = new Date().toISOString().split('T')[0];

// ── Fetch with PIN header ──
async function apiFetch(path, options = {}) {
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
  document.getElementById('pinDisplay').textContent = `PIN: ${userPin}`;
}

document.getElementById('pinSubmit').addEventListener('click', submitPin);
document.getElementById('pinInput').addEventListener('keydown', e => { if (e.key === 'Enter') submitPin(); });

// Only allow numeric input in PIN field
document.getElementById('pinInput').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

async function submitPin() {
  const input = document.getElementById('pinInput').value.trim();
  const err   = document.getElementById('pinError');
  if (!/^[0-9]{4,8}$/.test(input)) { err.textContent = 'PIN must be 4–8 digits.'; return; }

  userPin = input;
  err.textContent = '';

  try {
    const res  = await apiFetch('/currency');
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    currentCurrency = { currName: data.currName, symbol: data.symbol, ER: data.ER };
    localStorage.setItem('tt_pin', userPin);
    showApp();
    await initApp();
  } catch (e) {
    document.getElementById('pinError').textContent = 'Could not connect to server.';
  }
}

document.getElementById('switchPin').addEventListener('click', () => {
  localStorage.removeItem('tt_pin');
  userPin = '';
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
  showPinScreen();
});

// ════════════════════════════════════════
// LIVE EXCHANGE RATE
// ════════════════════════════════════════
// Uses the free exchangerate.host API (no key required).
// Fetches how many units of the current currency = 1 USD,
// then inverts to get: 1 unit of foreign currency = X USD.
//
// To change which currencies are available as presets, edit
// the data-name / data-rate attributes on .preset-btn in index.html.
//
// To disable live rates entirely, remove the fetchRateBtn from index.html.

async function fetchLiveRate(currName) {
  try {
    // Returns rates relative to USD base
    const res  = await fetch(`https://api.exchangerate.host/latest?base=USD&symbols=${currName}`);
    const data = await res.json();
    if (data.rates && data.rates[currName]) {
      // data.rates[currName] = how many foreign units per 1 USD
      // We want: 1 foreign unit = ? USD  →  invert it
      return 1 / data.rates[currName];
    }
  } catch (e) {
    console.warn('Live rate fetch failed:', e);
  }
  return null;
}

document.getElementById('fetchRateBtn').addEventListener('click', async () => {
  const btn = document.getElementById('fetchRateBtn');
  const { currName } = currentCurrency;

  if (currName === 'custom' || !currName) {
    flash(document.getElementById('addFeedback'), '⚠ Select a preset currency first.', '#c0504a');
    return;
  }

  btn.textContent = '...';
  btn.disabled = true;

  const rate = await fetchLiveRate(currName);

  btn.textContent = '↻ Live Rate';
  btn.disabled = false;

  if (rate) {
    await applyCurrency(currentCurrency.currName, currentCurrency.symbol, rate);
    flash(document.getElementById('addFeedback'), `✓ Rate updated: 1 ${currName} = $${rate.toFixed(5)}`, '#6a9e7f');
  } else {
    flash(document.getElementById('addFeedback'), '⚠ Could not fetch live rate.', '#c0504a');
  }
});

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
async function initApp() {
  document.getElementById('footerDate').textContent = formatDate(today);
  document.getElementById('ledgerDate').textContent  = formatDate(today);
  updateCurrencyUI();
  await loadTodayExpenses();
  renderLedger();
  refreshTodaySummary();
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
    if (tab.dataset.view === 'days')   renderDays();
    if (tab.dataset.view === 'charts') renderChart();
  });
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
  if (!name || !symbol || isNaN(rate) || rate <= 0) {
    flash(document.getElementById('addFeedback'), '⚠ Fill in all custom currency fields.', '#c0504a');
    return;
  }
  applyCurrency(name, symbol, rate);
  document.getElementById('customFields').classList.remove('visible');
});

async function applyCurrency(name, symbol, rate) {
  try {
    const res  = await apiFetch('/currency', { method: 'POST', body: JSON.stringify({ currName: name, symbol, ER: rate }) });
    const data = await res.json();
    currentCurrency = { currName: data.currName, symbol: data.symbol, ER: data.ER };
    updateCurrencyUI();
    updatePreview();
  } catch (e) { console.error('Currency set failed', e); }
}

function updateCurrencyUI() {
  const { currName, symbol, ER } = currentCurrency;
  document.getElementById('statusText').textContent = `${currName} — 1 ${symbol} = $${Number(ER).toFixed(4)}`;
  document.getElementById('currLabel').textContent   = `in ${currName} (${symbol})`;
  document.getElementById('sumForeignLabel').textContent = `${currName} today`;
}

document.getElementById('costInput').addEventListener('input', updatePreview);
function updatePreview() {
  const amount  = parseFloat(document.getElementById('costInput').value);
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
// EXPENSES
// ════════════════════════════════════════
async function loadTodayExpenses() {
  try {
    const res = await apiFetch(`/expenses?date=${today}`);
    todayExpenses = await res.json();
  } catch (e) { todayExpenses = []; }
}

document.getElementById('addBtn').addEventListener('click', async () => {
  const cost = parseFloat(document.getElementById('costInput').value);
  const fb   = document.getElementById('addFeedback');
  if (isNaN(cost) || cost <= 0) { flash(fb, '⚠ Enter a valid amount.', '#c0504a'); return; }

  const usd         = cost * currentCurrency.ER;
  const category    = document.getElementById('categorySelect').value;
  const description = document.getElementById('descInput').value.trim();

  try {
    const res   = await apiFetch('/expense', { method: 'POST', body: JSON.stringify({ cost, usd, category, description }) });
    const saved = await res.json();
    todayExpenses.push(saved);
    document.getElementById('costInput').value = '';
    document.getElementById('descInput').value = '';
    document.getElementById('usdPreview').textContent = '≈ $0.00';
    flash(fb, `✓ Recorded — $${usd.toFixed(2)}`, '#6a9e7f');
    renderLedger();
    refreshTodaySummary();
  } catch (e) { flash(fb, '✗ Could not reach server.', '#c0504a'); }
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
  const sym      = currentCurrency.symbol;
  const ledger   = document.getElementById('ledger');
  const filtered = activeFilter === 'All' ? todayExpenses
    : todayExpenses.filter(e => activeFilter === 'Other'
        ? !['Food','Transit','Merchandise','Lodging','Entertainment'].includes(e.category)
        : e.category === activeFilter);

  if (filtered.length === 0) {
    ledger.innerHTML = `<div class="empty-state"><span class="empty-icon">✈</span><p>${activeFilter === 'All' ? 'No expenses yet.<br>Start logging your journey.' : `No ${activeFilter} expenses today.`}</p></div>`;
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
  if (!confirm('Clear all expenses for today?')) return;
  try {
    await apiFetch(`/expenses?date=${today}`, { method: 'DELETE' });
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
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';
  try {
    const res  = await apiFetch('/days');
    const days = await res.json();

    if (days.length === 0) { container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span><p>No days recorded yet.</p></div>'; return; }

    container.innerHTML = days.map(d => `
      <div class="day-row" data-date="${d.date}">
        <span class="day-date ${d.date === today ? 'today' : ''}">${formatDate(d.date)}</span>
        <span class="day-count">${d.transactions} purchase${d.transactions !== 1 ? 's' : ''}</span>
        <span class="day-usd">$${Number(d.usdTotal).toFixed(2)}</span>
      </div>`).join('');

    container.querySelectorAll('.day-row').forEach(row => row.addEventListener('click', () => expandDay(row.dataset.date)));

    // Update all-time stats
    const allUsd = days.reduce((a, d) => a + d.usdTotal, 0);
    document.getElementById('allTransactions').textContent = days.reduce((a, d) => a + d.transactions, 0);
    document.getElementById('allUsd').textContent          = `$${allUsd.toFixed(2)}`;
    document.getElementById('allDays').textContent         = days.length;
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
    const res      = await apiFetch(`/expenses?date=${date}`);
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
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';

  const catUrl = chartScope === 'today' ? `/categories?date=${today}` : '/categories';
  const sumUrl = chartScope === 'today' ? `/summary?date=${today}`    : '/summary';

  try {
    const [catRes, sumRes, dayRes] = await Promise.all([apiFetch(catUrl), apiFetch(sumUrl), apiFetch('/days')]);
    const cats = await catRes.json();
    const sum  = await sumRes.json();
    const days = await dayRes.json();

    document.getElementById('allTransactions').textContent = days.reduce((a, d) => a + d.transactions, 0);
    document.getElementById('allUsd').textContent          = `$${days.reduce((a, d) => a + d.usdTotal, 0).toFixed(2)}`;
    document.getElementById('allDays').textContent         = days.length;

    if (cats.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📊</span><p>No data yet.</p></div>';
      totalsEl.innerHTML = '';
      return;
    }

    const colorClass = cat => ({ Food:'food', Transit:'transit', Merchandise:'merchandise', Lodging:'lodging', Entertainment:'entertainment' }[cat] || 'other');

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
  (async () => {
    try {
      const res  = await apiFetch('/currency');
      const data = await res.json();
      if (data.error) throw new Error();
      currentCurrency = { currName: data.currName, symbol: data.symbol, ER: data.ER };
      showApp();
      await initApp();
    } catch (e) { showPinScreen(); }
  })();
} else {
  showPinScreen();
}