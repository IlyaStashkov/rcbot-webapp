/* RC Bot MiniApp — Vanilla JS SPA
   API calls go to same origin (webapp_server.py)
   or to RC_API_BASE if defined. */

// ── Config ──────────────────────────────────────────────────────────────────
const RC_API_BASE = window.RC_API_BASE || '';  // '' = same origin

// ── Telegram WebApp init ─────────────────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Set header color to match
  try { tg.setHeaderColor('secondary_bg_color'); } catch(e) {}
}

const initData = tg?.initData || '';

// ── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                   'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

function fmtMoney(n) {
  if (n === null || n === undefined) return '—';
  return Math.round(n).toLocaleString('ru-RU') + ' ₽';
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'});
}
function monthLabel(y, m) {
  return MONTHS_RU[m-1] + ' ' + y;
}
function currentYM() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth()+1 };
}
function prevYM(y, m) {
  return m === 1 ? {y: y-1, m: 12} : {y, m: m-1};
}
function nextYM(y, m) {
  return m === 12 ? {y: y+1, m: 1} : {y, m: m+1};
}
function ymStr(y, m) {
  return `${y}-${String(m).padStart(2,'0')}`;
}

// ── Cache ─────────────────────────────────────────────────────────────────────
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6h
function cacheGet(key) {
  try {
    const raw = localStorage.getItem('rc_' + key);
    if (!raw) return null;
    const {ts, data} = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem('rc_' + key); return null; }
    return data;
  } catch { return null; }
}
function cacheSet(key, data) {
  try { localStorage.setItem('rc_' + key, JSON.stringify({ts: Date.now(), data})); } catch {}
}
function cacheInvalidate(prefix) {
  Object.keys(localStorage).filter(k => k.startsWith('rc_' + (prefix||''))).forEach(k => localStorage.removeItem(k));
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiGet(path, params = {}) {
  const url = new URL(RC_API_BASE + '/api' + path, location.origin);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      'X-Init-Data': initData,
      'Content-Type': 'application/json',
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status}: ${txt.slice(0,200)}`);
  }
  return res.json();
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function showError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '⚠️ ' + msg;
  el.classList.add('show');
}
function hideError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}
function setContent(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ── Router ────────────────────────────────────────────────────────────────────
let _currentPage = 'home';
const _pageHistory = [];

const App = {
  navigate(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    _pageHistory.push(_currentPage);
    _currentPage = page;
    // Load data for page
    App._loadPage(page);
  },

  back() {
    const prev = _pageHistory.pop() || 'home';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + prev)?.classList.add('active');
    _currentPage = prev;
  },

  async refresh() {
    const icon = document.getElementById('refresh-icon');
    icon?.classList.add('spin');
    cacheInvalidate();
    await App._loadPage(_currentPage);
    icon?.classList.remove('spin');
  },

  _loadPage(page) {
    switch(page) {
      case 'home':     return App.loadHome();
      case 'report':   return App.loadReport();
      case 'expenses': return App.loadExpenses();
      case 'objects':  return App.loadObjects();
      case 'bookings': return App.loadBookings();
      case 'staff':    return App.loadStaff();
      case 'settings': return App.loadSettings();
    }
  },

  // ── Home ───────────────────────────────────────────────────────────
  async loadHome() {
    hideError('home-error');
    const cym = currentYM();
    const key = `summary_${ymStr(cym.y, cym.m)}`;

    let data = cacheGet(key);
    if (!data) {
      try {
        data = await apiGet('/summary');
        cacheSet(key, data);
      } catch(e) {
        showError('home-error', 'Не удалось загрузить сводку. ' + e.message);
        return;
      }
    }

    // Update header subtitle
    const now = new Date();
    document.getElementById('header-sub').textContent =
      'Обновлено: ' + now.toLocaleTimeString('ru-RU', {hour:'2-digit', minute:'2-digit'});

    // Update menu hints
    document.getElementById('menu-objects-hint').textContent =
      data.objects_total ? `${data.objects_total} объектов` : 'Загрузка...';

    // Render summary
    const month = data.period || monthLabel(cym.y, cym.m);
    setContent('summary-content', `
      <div class="summary-period">📅 ${month}</div>
      <div class="summary-row">
        <span class="label">💰 Доход за месяц</span>
        <span class="value value-income">${fmtMoney(data.income)}</span>
      </div>
      <div class="summary-row">
        <span class="label">📤 Расходы за месяц</span>
        <span class="value value-expense">${fmtMoney(data.expenses)}</span>
      </div>
      <div class="summary-row">
        <span class="label">📈 Прибыль УК</span>
        <span class="value value-profit">${fmtMoney(data.profit)}</span>
      </div>

      <div class="summary-stats">
        <div class="stat-item">
          <span class="stat-emoji">🏠</span>
          <span class="stat-value">${data.objects_total ?? '—'}</span>
          <span class="stat-label">Объектов</span>
        </div>
        <div class="stat-item">
          <span class="stat-emoji">🔴</span>
          <span class="stat-value">${data.objects_free ?? '—'}</span>
          <span class="stat-label">Свободно</span>
        </div>
        <div class="stat-item">
          <span class="stat-emoji">📋</span>
          <span class="stat-value">${data.bookings_month ?? '—'}</span>
          <span class="stat-label">Броней</span>
        </div>
        <div class="stat-item">
          <span class="stat-emoji">👥</span>
          <span class="stat-value">${data.arrivals_today ?? '—'}</span>
          <span class="stat-label">Заездов сегодня</span>
        </div>
      </div>

      <div class="update-bar" style="margin-top:10px">
        <span><span class="dot"></span>Данные обновляются каждые 6 часов</span>
      </div>
    `);
  },

  // ── Report ─────────────────────────────────────────────────────────
  _reportYM: null,
  reportPrevMonth() {
    const {y,m} = App._reportYM || currentYM();
    App._reportYM = prevYM(y,m);
    App.loadReport();
  },
  reportNextMonth() {
    const cym = currentYM();
    const {y,m} = App._reportYM || cym;
    const next = nextYM(y,m);
    if (next.y > cym.y || (next.y===cym.y && next.m > cym.m)) return;
    App._reportYM = next;
    App.loadReport();
  },

  async loadReport() {
    if (!App._reportYM) App._reportYM = currentYM();
    const {y,m} = App._reportYM;
    const cym = currentYM();

    document.getElementById('report-month-label').textContent = monthLabel(y,m);
    document.getElementById('btn-report-next').disabled = (y===cym.y && m===cym.m);
    hideError('report-error');

    const key = `report_${ymStr(y,m)}`;
    let data = cacheGet(key);
    if (!data) {
      setContent('report-finance-content', skeletonLines(4));
      setContent('report-objects-content', skeletonLines(3));
      try {
        data = await apiGet('/report', {month: ymStr(y,m)});
        cacheSet(key, data);
      } catch(e) {
        showError('report-error', e.message);
        return;
      }
    }

    // Finance rows
    const finHtml = [
      row('💰', 'Доход', fmtMoney(data.income), 'value-income'),
      row('📤', 'Расходы', fmtMoney(data.expenses), 'value-expense'),
      row('📈', 'Прибыль УК', fmtMoney(data.profit), 'value-profit'),
      row('🏷️', 'Средний чек', fmtMoney(data.avg_bill), ''),
      row('🌙', 'Ночей продано', data.nights_sold ?? '—', ''),
      row('📊', 'Загрузка', data.occupancy ? data.occupancy + '%' : '—', ''),
    ].join('');
    setContent('report-finance-content', finHtml);

    // Objects breakdown
    const objs = data.objects || [];
    if (!objs.length) {
      setContent('report-objects-content', emptyState('🏠','Нет данных по объектам'));
    } else {
      setContent('report-objects-content', objs.map(o => `
        <div class="list-item">
          <div class="list-item-left">
            <span class="list-item-icon">🏠</span>
            <div class="list-item-main">
              <span class="list-item-name">${esc(o.name)}</span>
              <span class="list-item-sub">${o.nights ?? 0} ночей · загрузка ${o.occupancy ?? 0}%</span>
            </div>
          </div>
          <div class="list-item-right">
            <span class="list-item-value value-income">${fmtMoney(o.income)}</span>
          </div>
        </div>
      `).join(''));
    }
  },

  // ── Expenses ───────────────────────────────────────────────────────
  _expYM: null,
  expPrevMonth() {
    const {y,m} = App._expYM || currentYM();
    App._expYM = prevYM(y,m);
    App.loadExpenses();
  },
  expNextMonth() {
    const cym = currentYM();
    const {y,m} = App._expYM || cym;
    const next = nextYM(y,m);
    if (next.y > cym.y || (next.y===cym.y && next.m > cym.m)) return;
    App._expYM = next;
    App.loadExpenses();
  },

  async loadExpenses() {
    if (!App._expYM) App._expYM = currentYM();
    const {y,m} = App._expYM;
    const cym = currentYM();

    document.getElementById('exp-month-label').textContent = monthLabel(y,m);
    document.getElementById('btn-exp-next').disabled = (y===cym.y && m===cym.m);
    hideError('exp-error');

    const key = `expenses_${ymStr(y,m)}`;
    let data = cacheGet(key);
    if (!data) {
      setContent('expenses-content', skeletonLines(5));
      try {
        data = await apiGet('/expenses', {month: ymStr(y,m)});
        cacheSet(key, data);
      } catch(e) {
        showError('exp-error', e.message);
        return;
      }
    }

    const items = data.items || [];
    if (!items.length) {
      setContent('expenses-content', emptyState('📭','Расходов нет'));
    } else {
      const total = items.reduce((s,i) => s + (i.amount||0), 0);
      setContent('expenses-content', `
        ${items.map(e => `
          <div class="list-item">
            <div class="list-item-left">
              <span class="list-item-icon">📌</span>
              <div class="list-item-main">
                <span class="list-item-name">${esc(e.category || 'Без категории')}</span>
                <span class="list-item-sub">${esc(e.name || '')}</span>
              </div>
            </div>
            <div class="list-item-right">
              <span class="list-item-value value-expense">${fmtMoney(e.amount)}</span>
            </div>
          </div>
        `).join('')}
        <div class="summary-row" style="padding:12px 0 4px">
          <span style="font-weight:700">Итого</span>
          <span class="value value-expense" style="font-weight:700">${fmtMoney(total)}</span>
        </div>
      `);
    }
  },

  // ── Objects ────────────────────────────────────────────────────────
  async loadObjects() {
    hideError('objects-error');
    setContent('objects-content', skeletonLines(6));

    const key = 'objects';
    let data = cacheGet(key);
    if (!data) {
      try {
        data = await apiGet('/objects');
        cacheSet(key, data);
      } catch(e) {
        showError('objects-error', e.message);
        setContent('objects-content', '');
        return;
      }
    }

    const objs = data.objects || [];
    document.getElementById('objects-count').textContent = objs.length + ' объектов';

    if (!objs.length) {
      setContent('objects-content', emptyState('🏠','Объекты не найдены'));
      return;
    }

    const today = new Date().toISOString().slice(0,10);
    setContent('objects-content', objs.map(o => {
      const isFree = !o.busy;
      const badge = isFree
        ? '<span class="list-item-badge badge-free">Свободен</span>'
        : '<span class="list-item-badge badge-busy">Занят</span>';
      const sub = o.current_guest ? `Гость: ${esc(o.current_guest)}` : (o.next_arrival ? `Заезд: ${fmtDate(o.next_arrival)}` : '');
      return `
        <div class="list-item">
          <div class="list-item-left">
            <span class="list-item-icon">🏠</span>
            <div class="list-item-main">
              <span class="list-item-name">${esc(o.name)}</span>
              ${sub ? `<span class="list-item-sub">${sub}</span>` : ''}
            </div>
          </div>
          <div class="list-item-right">${badge}</div>
        </div>
      `;
    }).join(''));
  },

  // ── Bookings ───────────────────────────────────────────────────────
  _booksTab: 'today',
  bookingsTab(tab) {
    App._booksTab = tab;
    ['today','week','month'].forEach(t => {
      document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
    });
    App.loadBookings();
  },

  async loadBookings() {
    hideError('bookings-error');
    setContent('bookings-content', skeletonLines(4));

    const days = App._booksTab === 'today' ? 1 : App._booksTab === 'week' ? 7 : 30;
    const key = `bookings_${days}`;
    let data = cacheGet(key);
    if (!data) {
      try {
        data = await apiGet('/bookings', {days});
        cacheSet(key, data);
      } catch(e) {
        showError('bookings-error', e.message);
        setContent('bookings-content', '');
        return;
      }
    }

    const items = data.bookings || [];
    if (!items.length) {
      setContent('bookings-content', emptyState('📅', days===1 ? 'Сегодня заездов нет' : 'Нет броней в этом периоде'));
      return;
    }

    setContent('bookings-content', items.map(b => {
      const type = b.type === 'arrival'
        ? '<span class="list-item-badge badge-arriving">Заезд</span>'
        : '<span class="list-item-badge badge-leaving">Выезд</span>';
      return `
        <div class="list-item">
          <div class="list-item-left">
            <span class="list-item-icon">${b.type === 'arrival' ? '🟢' : '🔴'}</span>
            <div class="list-item-main">
              <span class="list-item-name">${esc(b.guest || 'Гость')}</span>
              <span class="list-item-sub">${esc(b.apartment)} · ${fmtDate(b.date)}</span>
            </div>
          </div>
          <div class="list-item-right">
            ${type}
            ${b.amount ? `<div style="font-size:13px;color:var(--hint);margin-top:2px">${fmtMoney(b.amount)}</div>` : ''}
          </div>
        </div>
      `;
    }).join(''));
  },

  // ── Staff ──────────────────────────────────────────────────────────
  async loadStaff() {
    hideError('staff-error');
    setContent('staff-content', skeletonLines(4));

    const key = 'staff';
    let data = cacheGet(key);
    if (!data) {
      try {
        data = await apiGet('/staff');
        cacheSet(key, data);
      } catch(e) {
        showError('staff-error', e.message);
        setContent('staff-content', '');
        return;
      }
    }

    const staff = data.staff || [];
    if (!staff.length) {
      setContent('staff-content', emptyState('👥','Сотрудники не добавлены'));
      return;
    }

    setContent('staff-content', staff.map(s => `
      <div class="list-item">
        <div class="list-item-left">
          <span class="list-item-icon">👤</span>
          <div class="list-item-main">
            <span class="list-item-name">${esc(s.name)}</span>
            <span class="list-item-sub">Фикс: ${fmtMoney(s.fix_salary)} · ${s.percent||0}% от дохода</span>
          </div>
        </div>
        <div class="list-item-right">
          <span class="list-item-value">${fmtMoney(s.estimated)}</span>
        </div>
      </div>
    `).join(''));
  },

  // ── Settings ───────────────────────────────────────────────────────
  async loadSettings() {
    const key = 'settings';
    let data = cacheGet(key);
    if (!data) {
      try {
        data = await apiGet('/settings');
        cacheSet(key, data);
      } catch(e) {
        setContent('settings-content', `<span style="color:var(--hint)">Не авторизован</span>`);
        document.getElementById('settings-api-status').textContent = '❌ Ошибка';
        return;
      }
    }
    setContent('settings-content', `
      <div class="list-item">
        <div class="list-item-left">
          <span class="list-item-icon">📧</span>
          <div class="list-item-main">
            <span class="list-item-name">RC Аккаунт</span>
            <span class="list-item-sub">${esc(data.rc_email || 'Не настроен')}</span>
          </div>
        </div>
      </div>
    `);
    document.getElementById('settings-api-status').textContent = data.rc_ok ? '✅ Подключён' : '❌ Ошибка соединения';
  },
};

// ── Render helpers ────────────────────────────────────────────────────────────
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function row(emoji, label, value, cls='') {
  return `<div class="summary-row">
    <span class="label">${emoji} ${label}</span>
    <span class="value ${cls}">${value}</span>
  </div>`;
}
function skeletonLines(n) {
  const widths = ['w90','w70','w80','w60','w50','w90'];
  return Array.from({length:n}, (_,i) =>
    `<div class="sk-line ${widths[i%widths.length]} skeleton" style="margin-bottom:12px"></div>`
  ).join('');
}
function emptyState(emoji, text) {
  return `<div class="empty-state"><div class="empty-emoji">${emoji}</div><div class="empty-text">${esc(text)}</div></div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────
(function init() {
  App.loadHome();
  // Preload objects count for menu hint (low priority)
  setTimeout(async () => {
    try {
      const data = cacheGet('objects') || await apiGet('/objects');
      cacheSet('objects', data);
      const total = data.objects?.length || 0;
      const free = data.objects?.filter(o => !o.busy).length || 0;
      document.getElementById('menu-objects-hint').textContent =
        `${total} объектов · ${free} свободно`;
    } catch {}
  }, 500);
})();
