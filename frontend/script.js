const API = 'http://127.0.0.1:8000/tasks';

let allTasks = [];
let currentFilter = 'all';

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
  checkServerAndFetch();

  document.getElementById('add-form').addEventListener('submit', handleAdd);

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;

      // Обновляем заголовок раздела
      const labels = { all: 'Все задачи', '0': 'Активные задачи', '1': 'Выполненные задачи' };
      document.getElementById('filter-label').textContent = labels[currentFilter];

      renderTasks();
    });
  });
});

// ===== ПРОВЕРКА СЕРВЕРА =====
async function checkServerAndFetch() {
  setStatus('checking', 'Подключение к серверу...');
  showLoading(true);

  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();
    allTasks = await res.json();
    setStatus('online', `Сервер работает — загружено ${allTasks.length} задач`);
    renderTasks();
  } catch (err) {
    setStatus('offline', 'Сервер недоступен. Запустите: uvicorn main:app --reload');
    showLoading(false);
    document.getElementById('empty-state').classList.remove('hidden');
    document.getElementById('empty-title').textContent = 'Нет подключения';
    document.getElementById('empty-sub').textContent = 'Запустите сервер FastAPI и обновите страницу';
  }
}

function setStatus(state, text) {
  const el = document.getElementById('server-status');
  const textEl = document.getElementById('status-text');
  el.className = `server-status ${state}`;
  textEl.textContent = text;
}

// ===== ЗАГРУЗКА ЗАДАЧ =====
async function fetchTasks() {
  try {
    const res = await fetch(API);
    if (!res.ok) throw new Error();
    allTasks = await res.json();
    renderTasks();
  } catch (err) {
    showToast('❌ Ошибка загрузки задач', 'error');
  }
}

// ===== РЕНДЕР =====
function renderTasks() {
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');
  const howTo = document.getElementById('how-to');

  const filtered = currentFilter === 'all'
    ? allTasks
    : allTasks.filter(t => String(t.status) === currentFilter);

  // Обновляем счётчики
  const totalCount = allTasks.length;
  const doneCount = allTasks.filter(t => t.status == 1).length;
  const pendingCount = allTasks.filter(t => t.status == 0).length;

  document.getElementById('count-all').textContent = totalCount;
  document.getElementById('count-done').textContent = doneCount;
  document.getElementById('count-pending').textContent = pendingCount;

  list.innerHTML = '';
  showLoading(false);

  if (totalCount > 0) {
    howTo.classList.remove('hidden');
  } else {
    howTo.classList.add('hidden');
  }

  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    if (currentFilter === '0') {
      document.getElementById('empty-title').textContent = 'Активных задач нет';
      document.getElementById('empty-sub').textContent = 'Все задачи выполнены 🎉';
    } else if (currentFilter === '1') {
      document.getElementById('empty-title').textContent = 'Выполненных задач нет';
      document.getElementById('empty-sub').textContent = 'Отметьте задачу выполненной, нажав ○';
    } else {
      document.getElementById('empty-title').textContent = 'Задач нет';
      document.getElementById('empty-sub').textContent = 'Добавьте первую задачу с помощью формы выше';
    }
    return;
  }

  empty.classList.add('hidden');

  filtered.forEach((task, i) => {
    const card = createTaskCard(task, i);
    list.appendChild(card);
  });
}

function createTaskCard(task, index) {
  const isDone = task.status == 1;
  const card = document.createElement('div');
  card.className = `task-card${isDone ? ' done' : ''}`;
  card.dataset.id = task.id;
  card.style.animationDelay = `${index * 40}ms`;

  card.innerHTML = `
    <button class="status-toggle" title="${isDone ? 'Отметить активной' : 'Отметить выполненной'}">
      ${isDone ? '✓' : ''}
    </button>
    <div class="task-info">
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-meta">
        <span class="meta-chip">👤 Пользователь ${task.user_id}</span>
        ${task.category_id ? `<span class="meta-chip">🏷️ Категория ${task.category_id}</span>` : ''}
        <span class="meta-chip id-chip">#${task.id}</span>
      </div>
    </div>
    <span class="status-badge ${isDone ? 'done' : 'pending'}">
      ${isDone ? '✓ Выполнено' : '● В работе'}
    </span>
    <button class="btn-delete" title="Удалить задачу">✕</button>
  `;

  card.querySelector('.btn-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    handleDelete(task.id, card);
  });
  card.querySelector('.status-toggle').addEventListener('click', () => handleToggle(task, card));

  return card;
}

// ===== ДОБАВИТЬ ЗАДАЧУ =====
async function handleAdd(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('submit-btn');

  const title = form.title.value.trim();
  const user_id = parseInt(form.user_id.value);
  const category_id = form.category_id.value ? parseInt(form.category_id.value) : null;

  if (!title) {
    showToast('⚠️ Введите название задачи', 'error');
    form.title.focus();
    return;
  }
  if (!user_id || user_id < 1) {
    showToast('⚠️ Введите корректный ID пользователя', 'error');
    form.user_id.focus();
    return;
  }

  btn.querySelector('.btn-text').textContent = 'Отправка...';
  btn.disabled = true;

  try {
    const body = { title, status: 0, user_id };
    if (category_id) body.category_id = category_id;

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Ошибка сервера: ${res.status}`);
    const newTask = await res.json();

    // ✅ Проверяем что сервер вернул валидный id
    if (!newTask.id) {
      throw new Error('Сервер не вернул ID задачи');
    }

    allTasks.unshift(newTask);
    form.reset();
    renderTasks();
    showToast('✦ Задача добавлена!', 'success');

    // Переключаем фильтр на "Все" чтобы задача была видна
    if (currentFilter !== 'all') {
      document.querySelector('[data-filter="all"]').click();
    }

  } catch (err) {
    showToast('❌ Ошибка: ' + err.message, 'error');
  } finally {
    btn.querySelector('.btn-text').textContent = 'Добавить задачу';
    btn.disabled = false;
  }
}

// ===== УДАЛИТЬ ЗАДАЧУ =====
async function handleDelete(id, cardEl) {
  // Просим подтверждение для важного действия
  if (!confirm('Удалить задачу?')) return;

  cardEl.style.transition = 'opacity 0.25s, transform 0.25s';
  cardEl.style.opacity = '0';
  cardEl.style.transform = 'translateX(32px)';

  try {
    const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Ошибка: ${res.status}`);

    allTasks = allTasks.filter(t => t.id !== id);
    setTimeout(() => renderTasks(), 260);
    showToast('Задача удалена', 'success');
  } catch (err) {
    cardEl.style.opacity = '1';
    cardEl.style.transform = '';
    showToast('❌ Ошибка удаления: ' + err.message, 'error');
  }
}

// ===== ИЗМЕНИТЬ СТАТУС =====
async function handleToggle(task, cardEl) {
  const newStatus = task.status == 1 ? 0 : 1;
  const isDone = newStatus == 1;

  // Обновляем UI сразу (оптимистично)
  task.status = newStatus;
  cardEl.classList.toggle('done', isDone);
  const toggleBtn = cardEl.querySelector('.status-toggle');
  toggleBtn.textContent = isDone ? '✓' : '';
  toggleBtn.title = isDone ? 'Отметить активной' : 'Отметить выполненной';
  const badge = cardEl.querySelector('.status-badge');
  badge.className = `status-badge ${isDone ? 'done' : 'pending'}`;
  badge.textContent = isDone ? '✓ Выполнено' : '● В работе';

  // Обновляем счётчики
  updateCounters();

  try {
    const res = await fetch(`${API}/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error();
    showToast(isDone ? '✓ Отмечено выполненным' : '● Возвращено в работу', 'success');
  } catch {
    // Откатываем если ошибка
    task.status = isDone ? 0 : 1;
    renderTasks();
    showToast('❌ Не удалось обновить статус', 'error');
  }

  if (currentFilter !== 'all') {
    setTimeout(() => renderTasks(), 300);
  }
}

function updateCounters() {
  document.getElementById('count-all').textContent = allTasks.length;
  document.getElementById('count-done').textContent = allTasks.filter(t => t.status == 1).length;
  document.getElementById('count-pending').textContent = allTasks.filter(t => t.status == 0).length;
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function showLoading(show) {
  const list = document.getElementById('task-list');
  const loading = list.querySelector('.loading-state');

  if (show && !loading) {
    list.innerHTML = `
      <div class="loading-state">
        <div class="spinner"></div>
        <p>Загрузка...</p>
      </div>`;
  } else if (!show && loading) {
    loading.remove();
  }
}

let toastTimer;
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
