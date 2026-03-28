const API = 'https://traveltally-web-production.up.railway.app/api';

// ── State ──
let currentCurrency = { currName: 'JPY', symbol: '¥', ER: 0.0064 };
let allExpenses = [];
let activeFilter = 'All';

// ── DOM refs ──
const costInput     = document.getElementById('costInput');
const usdPreview    = document.getElementById('usdPreview');
const descInput     = document.getElementById('descInput');
const categorySelect= document.getElementById('categorySelect');
const addBtn        = document.getElementById('addBtn');
const addFeedback   = document.getElementById('addFeedback');
const statusText    = document.getElementById('statusText');
const currLabel     = document.getElementById('currLabel');
const ledger        = document.getElementById('ledger');
const customFields  = document.getElementById('customFields');

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
    flash(addFeedback, '⚠ Please fill in all custom currency fields.', '#c0504a');
    return;
  }
  applyCurrency(name, symbol, rate);
  customFields.classList.remove('visible');
});

async function applyCurrency(name, symbol, rate) {
  const payload = { currName: name, symbol: symbol, ER: rate };
  try {
    const res = await fetch(`${API}/currency`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    currentCurrency = await res.json();
    updateCurrencyUI();
    updatePreview();
  } catch (e) {
    console.error('Failed to set currency', e);
  }
}

function updateCurrencyUI() {
  const { currName, symbol, ER } = currentCurrency;
  statusText.textContent = `${currName} — 1 ${symbol} = $${ER.toFixed(4)}`;
  currLabel.textContent  = `in ${currName} (${symbol})`;
  document.getElementById('sumForeignLabel').textContent = `${currName} spent`;
}

// ── Live USD preview ──
costInput.addEventListener('input', updatePreview);

function updatePreview() {
  const amount = parseFloat(costInput.value);
  if (!isNaN(amount) && amount > 0) {
    const usd = amount * currentCurrency.ER;
    usdPreview.textContent = `≈ $${usd.toFixed(2)}`;
    usdPreview.style.opacity = '1';
  } else {
    usdPreview.textContent = '≈ $0.00';
    usdPreview.style.opacity = '0.4';
  }
}

// ── Add Expense ──
addBtn.addEventListener('click', async () => {
  const cost = parseFloat(costInput.value);
  if (isNaN(cost) || cost <= 0) {
    flash(addFeedback, '⚠ Enter a valid amount.', '#c0504a');
    return;
  }

  const usd         = cost * currentCurrency.ER;
  const category    = categorySelect.value;
  const description = descInput.value.trim();

  const expense = { cost, usd, category, description };

  try {
    const res = await fetch(`${API}/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expense)
    });
    const saved = await res.json();
    allExpenses.push(saved);

    costInput.value  = '';
    descInput.value  = '';
    usdPreview.textContent = '≈ $0.00';

    flash(addFeedback, `✓ Recorded — $${usd.toFixed(2)}`, '#6a9e7f');
    renderLedger();
    refreshSummary();
  } catch (e) {
    flash(addFeedback, '✗ Could not reach server.', '#c0504a');
  }
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

// ── Render Ledger ──
function renderLedger() {
  const filtered = activeFilter === 'All'
    ? allExpenses
    : allExpenses.filter(e => {
        if (activeFilter === 'Other') {
          return !['Food','Transit','Merchandise','Lodging','Entertainment'].includes(e.category);
        }
        return e.category === activeFilter;
      });

  if (filtered.length === 0) {
    ledger.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">✈</span>
        <p>${activeFilter === 'All' ? 'No expenses yet.<br>Start logging your journey.' : `No ${activeFilter} expenses yet.`}</p>
      </div>`;
    return;
  }

  const sym = currentCurrency.symbol || currentCurrency.currName;

  ledger.innerHTML = filtered.slice().reverse().map(e => `
    <div class="entry">
      <span class="entry-cat">${e.category}</span>
      <span class="entry-desc ${e.description ? '' : 'no-desc'}">${e.description || '—'}</span>
      <span class="entry-foreign">${sym}${Number(e.cost).toLocaleString()}</span>
      <span class="entry-usd">$${Number(e.usd).toFixed(2)}</span>
    </div>
  `).join('');
}

// ── Summary ──
async function refreshSummary() {
  try {
    const res = await fetch(`${API}/summary`);
    const s   = await res.json();
    document.getElementById('sumTransactions').textContent = s.transactions;
    document.getElementById('sumForeign').textContent      = Number(s.costTotal).toLocaleString(undefined, { maximumFractionDigits: 0 });
    document.getElementById('sumUsd').textContent          = `$${Number(s.usdTotal).toFixed(2)}`;
  } catch (e) {
    console.warn('Summary fetch failed', e);
  }
}

// ── Clear Day ──
document.getElementById('clearBtn').addEventListener('click', async () => {
  if (!confirm('Clear all expenses for today?')) return;
  try {
    await fetch(`${API}/expenses`, { method: 'DELETE' });
    allExpenses = [];
    renderLedger();
    refreshSummary();
  } catch (e) {
    console.error('Clear failed', e);
  }
});

// ── Flash helper ──
function flash(el, msg, color) {
  el.textContent  = msg;
  el.style.color  = color;
  el.style.opacity = '1';
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
  await refreshSummary();
})();
