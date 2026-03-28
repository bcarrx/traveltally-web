const API = 'https://traveltally-web-production.up.railway.app/api';

// ── State ──
let currentCurrency = { currName: 'JPY', symbol: '¥', ER: 0.0064 };
let todayExpenses   = [];
let activeFilter    = 'All';
let chartScope      = 'today';
const today         = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// ── DOM ──
const costInput      = document.getElementById('costInput');
const usdPreview     = document.getElementById('usdPreview');
const descInput      = document.getElementById('descInput');
const categorySelect = document.getElementById('categorySelect');
const addBtn         = document.getElementById('addBtn');
const addFeedback    = document.getElementById('addFeedback');
const statusText     = document.getElementById('statusText');
const currLabel      = document.getElementById('currLabel');
const ledger         = document.getElementById('ledger');
const customFields   = document.getElementById('customFields');

// ── Footer date ──
document.getElementById('footerDate').textContent = formatDate(today);
document.getElementById('ledgerDate').textContent  = formatDate(today);

// ── Nav tabs ──
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

// ── Currency Presets ──
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.name === 'custom') {
      customFields.classList.add('visible');
    } else {
      customFields.classList.remove('visible');
      applyCurrency(btn.dataset.name, btn.dataset.symbol, parseFloat(btn.dataset.rate));
    }
  });
});

document.getElementById('setCustomBtn').addEventListener('click', () => {
  const name   = document.getElementById('custCode').value.trim().toUpperCase();
  const symbol = document.getElementById('custSymbol').value.trim();
  const rate   = parseFloat(document.getElementById('custRate').value);
  if (!name || !symbol || isNaN(rate) || rate <= 0) {
    flash(addFeedback, '⚠ Fill in all custom currency fields.', '#c0504a');
    return;
  }
  applyCurrency(name, symbol, rate);
  customFields.classList.remove('visible');
});

async function applyCurrency(name, symbol, rate) {
  try {
    const res = await fetch(`${API}/currency`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currName: name, symbol, ER: rate })
    });
    currentCurrency = await res.json();
    updateCurrencyUI();
    updatePreview();
  } catch (e) { console.error('Currency set failed', e); }
}

function updateCurrencyUI() {
  const { currName, symbol, ER } = currentCurrency;
  statusText.textContent = `${currName} — 1 ${symbol} = $${ER.toFixed(4)}`;
  currLabel.textContent  = `in ${currName} (${symbol})`;
  document.getElementById('sumForeignLabel').textContent = `${currName} today`;
}

// ── Live preview ──
costInput.addEventListener('input', updatePreview);
function updatePreview() {
  const amount = parseFloat(costInput.value);
  if (!isNaN(amount) && amount > 0) {
    usdPreview.textContent = `≈ $${(amount * currentCurrency.ER).toFixed(2)}`;
    usdPreview.style.opacity = '1';
  } else {
    usdPreview.textContent = '≈ $0.00';
    usdPreview.style.opacity = '0.4';
  }
}

// ── Add Expense ──
addBtn.addEventListener('click', async () => {
  const cost = parseFloat(costInput.value);
  if (isNaN(cost) || cost <= 0) { flash(addFeedback, '⚠ Enter a valid amount.', '#c0504a'); return; }

  const usd         = cost * currentCurrency.ER;
  const category    = categorySelect.value;
  const description = descInput.value.trim();

  try {
    const res = await fetch(`${API}/expense`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cost, usd, category, description })
    });
    const saved = await res.json();
    todayExpenses.push(saved);

    costInput.value = '';
    descInput.value = '';
    usdPreview.textContent = '≈ $0.00';

    flash(addFeedback, `✓ Recorded — $${usd.toFixed(2)}`, '#6a9e7f');
    renderLedger();
    refreshTodaySummary();
  } catch (e) { flash(addFeedback, '✗ Could not reach server.', '#c0504a'); }
});

// ── Filter Tabs ──
document.querySelectorAll('.filter-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeFilter = tab.dataset.filter;
    renderLedger();
  });
});

// ── Render today's ledger ──
function renderLedger() {
  const sym = currentCurrency.symbol || currentCurrency.currName;
  const filtered = activeFilter === 'All'
    ? todayExpenses
    : todayExpenses.filter(e => {
        if (activeFilter === 'Other') return !['Food','Transit','Merchandise','Lodging','Entertainment'].includes(e.category);
        return e.category === activeFilter;
      });

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

// ── Today Summary ──
function refreshTodaySummary() {
  const usdTotal  = todayExpenses.reduce((a, e) => a + e.usd, 0);
  const costTotal = todayExpenses.reduce((a, e) => a + e.cost, 0);
  document.getElementById('sumTransactions').textContent = todayExpenses.length;
  document.getElementById('sumForeign').textContent      = Math.round(costTotal).toLocaleString();
  document.getElementById('sumUsd').textContent          = `$${usdTotal.toFixed(2)}`;
}

// ── Clear Today ──
document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('Clear all expenses for today?')) return;
  try {
    await fetch(`${API}/expenses?date=${today}`, { method: 'DELETE' });
    todayExpenses = [];
    renderLedger();
    refreshTodaySummary();
  } catch (e) { console.error('Clear failed', e); }
});

// ── Days View ──
async function renderDays() {
  const container = document.getElementById('daysList');
  container.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';

  try {
    const res  = await fetch(`${API}/days`);
    const days = await res.json();

    if (days.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📅</span><p>No days recorded yet.</p></div>';
      return;
    }

    container.innerHTML = days.map(d => `
      <div class="day-row" data-date="${d.date}">
        <span class="day-date ${d.date === today ? 'today' : ''}">${formatDate(d.date)}</span>
        <span class="day-count">${d.transactions} purchase${d.transactions !== 1 ? 's' : ''}</span>
        <span class="day-usd">$${Number(d.usdTotal).toFixed(2)}</span>
      </div>`).join('');

    // Click to expand day
    container.querySelectorAll('.day-row').forEach(row => {
      row.addEventListener('click', () => expandDay(row.dataset.date));
    });

    // All-time stats for charts view
    const allUsd = days.reduce((a, d) => a + d.usdTotal, 0);
    document.getElementById('allTransactions').textContent = days.reduce((a, d) => a + d.transactions, 0);
    document.getElementById('allUsd').textContent          = `$${allUsd.toFixed(2)}`;
    document.getElementById('allDays').textContent         = days.length;

  } catch (e) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠</span><p>Could not load days.</p></div>';
  }
}

async function expandDay(date) {
  document.getElementById('daysList').closest('.panel').style.display = 'none';
  const detail = document.getElementById('dayDetail');
  detail.style.display = 'block';
  document.getElementById('dayDetailDate').textContent = formatDate(date);

  const detailLedger = document.getElementById('dayDetailLedger');
  detailLedger.innerHTML = '<div class="empty-state"><span class="empty-icon">⏳</span><p>Loading...</p></div>';

  try {
    const res      = await fetch(`${API}/expenses?date=${date}`);
    const expenses = await res.json();
    const sym      = currentCurrency.symbol || currentCurrency.currName;

    if (expenses.length === 0) {
      detailLedger.innerHTML = '<div class="empty-state"><p>No expenses for this day.</p></div>';
      return;
    }

    detailLedger.innerHTML = expenses.slice().reverse().map(e => `
      <div class="entry">
        <span class="entry-cat">${e.category}</span>
        <span class="entry-desc ${e.description ? '' : 'no-desc'}">${e.description || '—'}</span>
        <span class="entry-foreign">${sym}${Number(e.cost).toLocaleString()}</span>
        <span class="entry-usd">$${Number(e.usd).toFixed(2)}</span>
      </div>`).join('');
  } catch (e) {
    detailLedger.innerHTML = '<div class="empty-state"><p>Could not load expenses.</p></div>';
  }
}

document.getElementById('backToDays').addEventListener('click', () => {
  document.getElementById('dayDetail').style.display = 'none';
  document.getElementById('daysList').closest('.panel').style.display = 'block';
});

// ── Chart View ──
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

  const url = chartScope === 'today'
    ? `${API}/categories?date=${today}`
    : `${API}/categories`;

  try {
    const res  = await fetch(url);
    const cats = await res.json();

    // Also fetch summary for totals row
    const sumUrl = chartScope === 'today'
      ? `${API}/summary?date=${today}`
      : `${API}/summary`;
    const sumRes = await fetch(sumUrl);
    const sum    = await sumRes.json();

    if (cats.length === 0) {
      container.innerHTML = '<div class="empty-state"><span class="empty-icon">📊</span><p>No data yet.</p></div>';
      totalsEl.innerHTML = '';
      return;
    }

    const colorClass = cat => {
      const map = { Food:'food', Transit:'transit', Merchandise:'merchandise', Lodging:'lodging', Entertainment:'entertainment' };
      return map[cat] || 'other';
    };

    container.innerHTML = cats.map(c => `
      <div class="cat-row">
        <span class="cat-name">${c.category}</span>
        <div class="cat-bar-track">
          <div class="cat-bar-fill ${colorClass(c.category)}" style="width: ${Math.round(c.percent)}%"></div>
        </div>
        <span class="cat-usd">$${Number(c.usd).toFixed(2)}</span>
      </div>`).join('');

    totalsEl.innerHTML = `
      <span>${sum.transactions} purchases</span>
      <span>Total: <strong style="color:var(--green)">$${Number(sum.usdTotal).toFixed(2)}</strong></span>`;

    // Update all-time stats too
    if (chartScope === 'all') {
      const dayRes  = await fetch(`${API}/days`);
      const dayData = await dayRes.json();
      document.getElementById('allTransactions').textContent = sum.transactions;
      document.getElementById('allUsd').textContent          = `$${Number(sum.usdTotal).toFixed(2)}`;
      document.getElementById('allDays').textContent         = dayData.length;
    }

  } catch (e) {
    container.innerHTML = '<div class="empty-state"><span class="empty-icon">⚠</span><p>Could not load data.</p></div>';
  }
}

// ── Helpers ──
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  const date = new Date(+y, +m - 1, +d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function flash(el, msg, color) {
  el.textContent = msg; el.style.color = color; el.style.opacity = '1';
  setTimeout(() => { el.style.opacity = '0'; }, 2500);
}

// ── Init ──
(async () => {
  try {
    const res = await fetch(`${API}/currency`);
    currentCurrency = await res.json();
    updateCurrencyUI();
  } catch (e) {
    statusText.textContent = 'Server offline — start Spring Boot first';
  }

  try {
    const res = await fetch(`${API}/expenses?date=${today}`);
    todayExpenses = await res.json();
    renderLedger();
    refreshTodaySummary();
  } catch (e) { console.warn('Could not load today expenses'); }
})();