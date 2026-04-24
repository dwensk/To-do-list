const API = '';
let token = localStorage.getItem('tf_token') || '';
let username = localStorage.getItem('tf_user') || '';
let allTasks = [], allCats = [];
let filterStatus = 'all', filterCat = null, filterPriority = 'all';
let filterDate = 'all', sortBy = 'created_at', sortDir = 'desc';
let searchQ = '', searchTimer = null;

// ── ИНИЦИАЛИЗАЦИЯ ──
window.onload = () => {
  if (token) { showApp(); loadAll(); }
  else showAuth();
};

// ── AUTH ──
function showAuth() {
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('main-section').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('main-section').classList.remove('hidden');
  document.getElementById('username-display').textContent = '👤 ' + username;
}

function showLogin() {
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('register-box').classList.add('hidden');
}

function showRegister() {
  document.getElementById('login-box').classList.add('hidden');
  document.getElementById('register-box').classList.remove('hidden');
}

async function doLogin() {
  const u = document.getElementById('l-username').value.trim();
  const p = document.getElementById('l-password').value;
  if (!u || !p) { toast('Заполните все поля', 'error'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Вход...';
  try {
    const res = await api('POST', '/auth/login', { username: u, password: p });
    token = res.token; username = res.username;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', username);
    showApp(); loadAll(); toast('Добро пожаловать, ' + username + '!');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Войти'; }
}

async function doRegister() {
  const u = document.getElementById('r-username').value.trim();
  const e = document.getElementById('r-email').value.trim();
  const p = document.getElementById('r-password').value;
  let ok = true;
  if (!u || u.length < 3) { showErr('r-username-err', 'Минимум 3 символа'); ok = false; } else hideErr('r-username-err');
  if (!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) { showErr('r-email-err', 'Неверный формат email'); ok = false; } else hideErr('r-email-err');
  if (!p || p.length < 6) { showErr('r-pass-err', 'Минимум 6 символов'); ok = false; } else hideErr('r-pass-err');
  if (!ok) return;
  try {
    const res = await api('POST', '/auth/register', { username: u, email: e, password: p });
    token = res.token; username = res.username;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', username);
    showApp(); loadAll(); toast('Аккаунт создан!');
  } catch (err) { toast(err.message, 'error'); }
}

function doLogout() {
  token = ''; username = '';
  localStorage.removeItem('tf_token');
  localStorage.removeItem('tf_user');
  allTasks = []; allCats = [];
  showAuth(); showLogin();
  toast('Вы вышли из аккаунта');
}

function showErr(id, msg) { const el = document.getElementById(id); el.textContent = msg; el.classList.remove('hidden'); }
function hideErr(id) { document.getElementById(id).classList.add('hidden'); }

// ── ЗАГРУЗКА ──
async function loadAll() { await Promise.all([loadCats(), loadTasks()]); }

async function loadCats() {
  try {
    allCats = await api('GET', '/categories');
    renderCats();
    updateCatSelect();
  } catch (e) {}
}

async function loadTasks() {
  showLoading(true);
  try {
    let url = '/tasks?';
    if (searchQ) url += 'search=' + encodeURIComponent(searchQ) + '&';
    if (filterStatus !== 'all') url += 'status=' + filterStatus + '&';
    if (filterCat) url += 'category_id=' + filterCat + '&';
    if (filterPriority !== 'all') url += 'priority=' + filterPriority + '&';
    allTasks = await api('GET', url);
    renderTasks();
  } catch (e) { showLoading(false); }
}

// ── КАТЕГОРИИ ──
function renderCats() {
  const list = document.getElementById('cats-list');
  document.getElementById('s-cats').textContent = allCats.length;

  const all = document.createElement('div');
  all.className = 'cat-chip' + (!filterCat ? ' active' : '');
  all.textContent = 'Все';
  all.onclick = () => { filterCat = null; loadTasks(); renderCats(); };
  list.innerHTML = '';
  list.appendChild(all);

  allCats.forEach(c => {
    const chip = document.createElement('div');
    chip.className = 'cat-chip' + (filterCat === c.id ? ' active' : '');
    chip.innerHTML = `<span onclick="setCatFilter(${c.id})">${esc(c.name)}</span><button class="cat-del" onclick="delCat(${c.id})">✕</button>`;
    list.appendChild(chip);
  });
}

function setCatFilter(id) { filterCat = filterCat === id ? null : id; loadTasks(); renderCats(); }

function updateCatSelect() {
  [document.getElementById('t-category'), document.getElementById('edit-category')].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">— без категории —</option>';
    allCats.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id; o.textContent = c.name;
      sel.appendChild(o);
    });
  });
}

async function addCategory() {
  const inp = document.getElementById('new-cat');
  const name = inp.value.trim();
  if (!name) { toast('Введите название категории', 'error'); return; }
  try {
    const cat = await api('POST', '/categories', { name });
    allCats.push(cat); inp.value = '';
    renderCats(); updateCatSelect(); toast('Категория добавлена');
  } catch (e) { toast(e.message, 'error'); }
}

async function delCat(id) {
  if (!confirm('Удалить категорию?')) return;
  try {
    await api('DELETE', '/categories/' + id);
    allCats = allCats.filter(c => c.id !== id);
    if (filterCat === id) filterCat = null;
    renderCats(); updateCatSelect(); loadTasks(); toast('Категория удалена');
  } catch (e) { toast(e.message, 'error'); }
}

// ── ФИЛЬТРЫ ──
function setFilter(val, btn) {
  filterStatus = val;
  document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTasks();
  updateActiveFilterTags();
}

function setPriority(val, btn) {
  filterPriority = val;
  document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadTasks();
  updateActiveFilterTags();
}

function setDateFilter(val) {
  filterDate = val;
  renderTasks();
  updateActiveFilterTags();
}

function setSort(val) {
  sortBy = val;
  renderTasks();
}

function toggleSortDir() {
  sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  document.getElementById('sort-dir').textContent = sortDir === 'desc' ? '↓' : '↑';
  renderTasks();
}

function onSearch() {
  clearTimeout(searchTimer);
  const val = document.getElementById('search-inp').value;
  document.getElementById('search-clear').classList.toggle('hidden', !val);
  searchTimer = setTimeout(() => {
    searchQ = val.trim();
    loadTasks();
    updateActiveFilterTags();
  }, 350);
}

function clearSearch() {
  document.getElementById('search-inp').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  searchQ = '';
  loadTasks();
  updateActiveFilterTags();
}

function resetAllFilters() {
  filterStatus = 'all'; filterPriority = 'all'; filterDate = 'all';
  filterCat = null; searchQ = ''; sortBy = 'created_at'; sortDir = 'desc';
  document.getElementById('search-inp').value = '';
  document.getElementById('search-clear').classList.add('hidden');
  document.getElementById('date-filter').value = 'all';
  document.getElementById('sort-by').value = 'created_at';
  document.getElementById('sort-dir').textContent = '↓';
  document.querySelectorAll('.ftab').forEach(b => b.classList.toggle('active', b.dataset.f === 'all'));
  document.querySelectorAll('.ptab').forEach(b => b.classList.toggle('active', b.dataset.p === 'all'));
  renderCats();
  loadTasks();
  updateActiveFilterTags();
  toast('Фильтры сброшены');
}

// Тег активных фильтров
function updateActiveFilterTags() {
  const wrap = document.getElementById('active-filters');
  const tags = [];
  if (filterStatus === '0') tags.push({ label: '● Активные', clear: () => { setFilter('all', document.querySelector('.ftab[data-f="all"]')); } });
  if (filterStatus === '1') tags.push({ label: '✓ Выполненные', clear: () => { setFilter('all', document.querySelector('.ftab[data-f="all"]')); } });
  if (filterPriority === '1') tags.push({ label: '🟢 Низкий', clear: () => { setPriority('all', document.querySelector('.ptab[data-p="all"]')); } });
  if (filterPriority === '2') tags.push({ label: '🟡 Средний', clear: () => { setPriority('all', document.querySelector('.ptab[data-p="all"]')); } });
  if (filterPriority === '3') tags.push({ label: '🔴 Высокий', clear: () => { setPriority('all', document.querySelector('.ptab[data-p="all"]')); } });
  if (filterDate !== 'all') {
    const labels = { today: 'Сегодня', week: 'Эта неделя', month: 'Этот месяц' };
    tags.push({ label: '📅 ' + labels[filterDate], clear: () => { filterDate = 'all'; document.getElementById('date-filter').value = 'all'; renderTasks(); updateActiveFilterTags(); } });
  }
  if (filterCat) {
    const cat = allCats.find(c => c.id === filterCat);
    if (cat) tags.push({ label: '🏷️ ' + cat.name, clear: () => { filterCat = null; renderCats(); loadTasks(); updateActiveFilterTags(); } });
  }
  if (searchQ) tags.push({ label: '🔍 "' + searchQ + '"', clear: clearSearch });

  if (tags.length === 0) { wrap.classList.add('hidden'); wrap.innerHTML = ''; return; }
  wrap.classList.remove('hidden');
  wrap.innerHTML = '<span class="af-label">Активные фильтры:</span>';
  tags.forEach(t => {
    const el = document.createElement('span');
    el.className = 'af-tag';
    el.innerHTML = `${esc(t.label)} <button onclick="void(0)">✕</button>`;
    el.querySelector('button').onclick = t.clear;
    wrap.appendChild(el);
  });
}

// ── ФИЛЬТРАЦИЯ И СОРТИРОВКА НА КЛИЕНТЕ ──
function getFilteredSortedTasks() {
  let tasks = [...allTasks];

  // Фильтр по дате создания
  if (filterDate !== 'all') {
    const now = new Date();
    tasks = tasks.filter(t => {
      const d = new Date(t.created_at);
      if (filterDate === 'today') {
        return d.toDateString() === now.toDateString();
      } else if (filterDate === 'week') {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      } else if (filterDate === 'month') {
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }

  // Сортировка
  tasks.sort((a, b) => {
    let va, vb;
    if (sortBy === 'priority') { va = a.priority; vb = b.priority; }
    else if (sortBy === 'title') { va = a.title.toLowerCase(); vb = b.title.toLowerCase(); }
    else if (sortBy === 'status') { va = a.status; vb = b.status; }
    else { va = a.created_at || ''; vb = b.created_at || ''; }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  return tasks;
}

// ── ЗАДАЧИ ──
function renderTasks() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty');
  showLoading(false);

  const tasks = getFilteredSortedTasks();
  const done = allTasks.filter(t => t.status == 1).length;
  const high = allTasks.filter(t => t.priority == 3 && t.status == 0).length;

  document.getElementById('s-total').textContent = allTasks.length;
  document.getElementById('s-active').textContent = allTasks.filter(t => t.status == 0).length;
  document.getElementById('s-done').textContent = done;
  document.getElementById('s-high').textContent = high;
  document.getElementById('s-cats').textContent = allCats.length;

  // Прогресс
  const pct = allTasks.length ? Math.round((done / allTasks.length) * 100) : 0;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-label').textContent = pct + '% выполнено';

  document.getElementById('how-to').classList.toggle('hidden', allTasks.length === 0);

  list.innerHTML = '';
  if (tasks.length === 0) {
    empty.classList.remove('hidden');
    document.getElementById('empty-title').textContent = allTasks.length === 0 ? 'Задач нет' : 'Ничего не найдено';
    document.getElementById('empty-sub').textContent = allTasks.length === 0 ? 'Добавьте первую задачу выше' : 'Попробуйте изменить фильтры';
    return;
  }
  empty.classList.add('hidden');
  tasks.forEach((t, i) => list.appendChild(createCard(t, i)));
}

function createCard(task, i) {
  const done = task.status == 1;
  const pLabels = { 1: '🟢 Низкий', 2: '🟡 Средний', 3: '🔴 Высокий' };
  const card = document.createElement('div');
  card.className = 'task-card' + (done ? ' done' : '') + (task.priority == 3 && !done ? ' high-priority' : '');
  card.style.animationDelay = i * 30 + 'ms';

  // Дата создания
  const createdStr = task.created_at ? formatDate(task.created_at) : '';
  // Срок выполнения (если есть поле due_date)
  const dueStr = task.due_date ? formatDue(task.due_date) : '';
  const isOverdue = task.due_date && !done && new Date(task.due_date) < new Date();

  card.innerHTML = `
    <button class="toggle" title="${done ? 'Вернуть в работу' : 'Отметить выполненной'}">${done ? '✓' : ''}</button>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="chip priority-${task.priority}">${pLabels[task.priority] || ''}</span>
        ${task.category_name ? `<span class="chip chip-cat">🏷️ ${esc(task.category_name)}</span>` : ''}
        ${createdStr ? `<span class="chip chip-date">📅 ${createdStr}</span>` : ''}
        ${dueStr ? `<span class="chip chip-due ${isOverdue ? 'overdue' : ''}">⏰ ${dueStr}${isOverdue ? ' • Просрочено' : ''}</span>` : ''}
        <span class="chip chip-id">#${task.id}</span>
      </div>
    </div>
    <span class="badge ${done ? 'done' : 'pending'}">${done ? '✓ Готово' : '● В работе'}</span>
    <div class="card-actions">
      <button class="btn-edit" title="Редактировать">✎</button>
      <button class="btn-del" title="Удалить">✕</button>
    </div>`;

  card.querySelector('.toggle').onclick = () => toggleTask(task, card);
  card.querySelector('.btn-edit').onclick = () => openEditModal(task);
  card.querySelector('.btn-del').onclick = () => deleteTask(task.id, card);
  return card;
}

function formatDate(str) {
  const d = new Date(str);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Сегодня';
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatDue(str) {
  const d = new Date(str);
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

async function addTask() {
  const title = document.getElementById('t-title').value.trim();
  const desc = document.getElementById('t-desc').value.trim();
  const priority = parseInt(document.getElementById('t-priority').value);
  const cat = document.getElementById('t-category').value;
  const due = document.getElementById('t-due').value;
  if (!title) { toast('Введите название задачи', 'error'); document.getElementById('t-title').focus(); return; }
  const btn = document.getElementById('btn-add');
  btn.disabled = true; btn.textContent = 'Отправка...';
  try {
    const body = { title, status: 0, priority };
    if (desc) body.description = desc;
    if (cat) body.category_id = parseInt(cat);
    if (due) body.due_date = due;
    const task = await api('POST', '/tasks', body);
    allTasks.unshift(task);
    document.getElementById('t-title').value = '';
    document.getElementById('t-desc').value = '';
    document.getElementById('t-due').value = '';
    renderTasks(); toast('✦ Задача добавлена!');
  } catch (e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; btn.textContent = '+ Добавить задачу'; }
}

async function deleteTask(id, card) {
  if (!confirm('Удалить задачу?')) return;
  card.style.cssText += 'transition:opacity .2s,transform .2s;opacity:0;transform:translateX(28px)';
  try {
    await api('DELETE', '/tasks/' + id);
    allTasks = allTasks.filter(t => t.id !== id);
    setTimeout(renderTasks, 220); toast('Задача удалена');
  } catch (e) { card.style.opacity = '1'; card.style.transform = ''; toast(e.message, 'error'); }
}

async function toggleTask(task, card) {
  const newStatus = task.status == 1 ? 0 : 1;
  task.status = newStatus;
  const done = newStatus == 1;
  card.classList.toggle('done', done);
  card.classList.toggle('high-priority', !done && task.priority == 3);
  card.querySelector('.toggle').textContent = done ? '✓' : '';
  const badge = card.querySelector('.badge');
  badge.className = 'badge ' + (done ? 'done' : 'pending');
  badge.textContent = done ? '✓ Готово' : '● В работе';
  try {
    await api('PATCH', '/tasks/' + task.id, { status: newStatus });
    renderTasks();
    toast(done ? '✓ Выполнено' : '● Возвращено в работу');
  } catch { renderTasks(); }
}

// ── УТИЛИТЫ ──
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Ошибка сервера');
  return data;
}

function showLoading(show) {
  const list = document.getElementById('task-list');
  const loading = list.querySelector('.loading');
  if (show && !loading) list.innerHTML = '<div class="loading"><div class="spinner"></div><p>Загрузка...</p></div>';
  else if (!show && loading) loading.remove();
}

let tTimer;
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// ── РЕДАКТИРОВАНИЕ ──
function openEditModal(task) {
  document.getElementById('edit-id').value = task.id;
  document.getElementById('edit-title').value = task.title;
  document.getElementById('edit-desc').value = task.description || '';
  document.getElementById('edit-priority').value = task.priority;
  if (document.getElementById('edit-due')) {
    document.getElementById('edit-due').value = task.due_date || '';
  }
  const catSel = document.getElementById('edit-category');
  catSel.innerHTML = '<option value="">— без категории —</option>';
  allCats.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    if (c.id === task.category_id) o.selected = true;
    catSel.appendChild(o);
  });
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function onOverlayClick(e) {
  if (e.target === document.getElementById('edit-modal')) closeEditModal();
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const desc = document.getElementById('edit-desc').value.trim();
  const priority = parseInt(document.getElementById('edit-priority').value);
  const cat = document.getElementById('edit-category').value;
  const due = document.getElementById('edit-due') ? document.getElementById('edit-due').value : '';
  if (!title) { toast('Введите название', 'error'); return; }
  const body = { title, priority };
  if (desc) body.description = desc;
  body.category_id = cat ? parseInt(cat) : null;
  if (due) body.due_date = due;
  try {
    const updated = await api('PATCH', '/tasks/' + id, body);
    const idx = allTasks.findIndex(t => t.id == id);
    if (idx !== -1) allTasks[idx] = updated;
    renderTasks();
    closeEditModal();
    toast('✎ Задача обновлена');
  } catch (e) { toast(e.message, 'error'); }
}
