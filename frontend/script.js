const API = ''; // Оставляем пустым, чтобы запросы шли на текущий домен
let token = localStorage.getItem('tf_token') || '';
let username = localStorage.getItem('tf_user') || '';
let allTasks = [], allCats = [];
let filterStatus = 'all', filterCat = null, searchQ = '';
let searchTimer = null;

// ── ИНИЦИАЛИЗАЦИЯ ──
window.onload = () => {
  if (token) { showApp(); loadAll(); }
  else showAuth();
};

// ── AUTH ──
function showAuth(){
  document.getElementById('auth-section').classList.remove('hidden');
  document.getElementById('main-section').classList.add('hidden');
}

function showApp(){
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('main-section').classList.remove('hidden');
  document.getElementById('username-display').textContent = '👤 ' + username;
}

function showLogin(){
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('register-box').classList.add('hidden');
}

function showRegister(){
  document.getElementById('login-box').classList.add('hidden');
  document.getElementById('register-box').classList.remove('hidden');
}

async function doLogin(){
  const u = document.getElementById('l-username').value.trim();
  const p = document.getElementById('l-password').value;
  if(!u || !p){ toast('Заполните все поля','error'); return; }
  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Вход...';
  try{
    const res = await api('POST', '/auth/login', {username:u, password:p});
    token = res.token; username = res.username;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', username);
    showApp(); loadAll(); toast('Добро пожаловать, ' + username + '!');
  }catch(e){ toast(e.message, 'error'); }
  finally{ btn.disabled = false; btn.textContent = 'Войти'; }
}

async function doRegister(){
  const u = document.getElementById('r-username').value.trim();
  const e = document.getElementById('r-email').value.trim();
  const p = document.getElementById('r-password').value;
  let ok = true;
  if(!u || u.length < 3){ showErr('r-username-err','Минимум 3 символа'); ok=false; } else hideErr('r-username-err');
  if(!e || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)){ showErr('r-email-err','Неверный формат email'); ok=false; } else hideErr('r-email-err');
  if(!p || p.length < 6){ showErr('r-pass-err','Минимум 6 символов'); ok=false; } else hideErr('r-pass-err');
  if(!ok) return;
  try{
    const res = await api('POST', '/auth/register', {username:u, email:e, password:p});
    token = res.token; username = res.username;
    localStorage.setItem('tf_token', token);
    localStorage.setItem('tf_user', username);
    showApp(); loadAll(); toast('Аккаунт создан!');
  }catch(err){ toast(err.message, 'error'); }
}

function doLogout(){
  token = ''; username = '';
  localStorage.removeItem('tf_token');
  localStorage.removeItem('tf_user');
  allTasks = []; allCats = [];
  showAuth(); showLogin();
  toast('Вы вышли из аккаунта');
}

function showErr(id, msg){ const el=document.getElementById(id); el.textContent=msg; el.classList.remove('hidden'); }
function hideErr(id){ document.getElementById(id).classList.add('hidden'); }

// ── ЗАГРУЗКА ──
async function loadAll(){ await Promise.all([loadCats(), loadTasks()]); }

async function loadCats(){
  try{
    allCats = await api('GET', '/categories');
    renderCats();
    updateCatSelect();
  }catch(e){}
}

async function loadTasks(){
  showLoading(true);
  try{
    let url = '/tasks?';
    if(searchQ) url += 'search=' + encodeURIComponent(searchQ) + '&';
    if(filterStatus !== 'all') url += 'status=' + filterStatus + '&';
    if(filterCat) url += 'category_id=' + filterCat + '&';
    allTasks = await api('GET', url);
    renderTasks();
  }catch(e){ showLoading(false); }
}

// ── КАТЕГОРИИ ──
function renderCats(){
  const list = document.getElementById('cats-list');
  document.getElementById('s-cats').textContent = allCats.length;

  // Кнопка "Все"
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

function setCatFilter(id){ filterCat = filterCat === id ? null : id; loadTasks(); renderCats(); }

function updateCatSelect(){
  const sel = document.getElementById('t-category');
  sel.innerHTML = '<option value="">— без категории —</option>';
  allCats.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.name;
    sel.appendChild(o);
  });
}

async function addCategory(){
  const inp = document.getElementById('new-cat');
  const name = inp.value.trim();
  if(!name){ toast('Введите название категории','error'); return; }
  try{
    const cat = await api('POST', '/categories', {name});
    allCats.push(cat); inp.value = '';
    renderCats(); updateCatSelect(); toast('Категория добавлена');
  }catch(e){ toast(e.message,'error'); }
}

async function delCat(id){
  if(!confirm('Удалить категорию?')) return;
  try{
    await api('DELETE', '/categories/' + id);
    allCats = allCats.filter(c => c.id !== id);
    if(filterCat === id) filterCat = null;
    renderCats(); updateCatSelect(); loadTasks(); toast('Категория удалена');
  }catch(e){ toast(e.message,'error'); }
}

// ── ЗАДАЧИ ──
function renderTasks(){
  const list = document.getElementById('task-list');
  const empty = document.getElementById('empty');
  showLoading(false);

  const done = allTasks.filter(t => t.status == 1).length;
  document.getElementById('s-total').textContent = allTasks.length;
  document.getElementById('s-active').textContent = allTasks.length - done;
  document.getElementById('s-done').textContent = done;
  document.getElementById('how-to').classList.toggle('hidden', allTasks.length === 0);

  list.innerHTML = '';

  if(allTasks.length === 0){
    empty.classList.remove('hidden');
    const msgs = {
      all: ['Задач нет','Добавьте первую задачу выше'],
      '0': ['Активных нет','Все задачи выполнены 🎉'],
      '1': ['Выполненных нет','Отметьте задачу кружком ○']
    };
    const [t,s] = msgs[filterStatus] || msgs.all;
    document.getElementById('empty-title').textContent = t;
    document.getElementById('empty-sub').textContent = s;
    return;
  }
  empty.classList.add('hidden');
  allTasks.forEach((t,i) => list.appendChild(createCard(t,i)));
}

function createCard(task, i){
  const done = task.status == 1;
  const pLabels = {1:'🟢 Низкий', 2:'🟡 Средний', 3:'🔴 Высокий'};
  const card = document.createElement('div');
  card.className = 'task-card' + (done ? ' done' : '');
  card.style.animationDelay = i * 35 + 'ms';
  card.innerHTML = `
    <button class="toggle" title="${done ? 'Вернуть в работу' : 'Отметить выполненной'}">${done ? '✓' : ''}</button>
    <div class="task-body">
      <div class="task-title">${esc(task.title)}</div>
      ${task.description ? `<div class="task-desc">${esc(task.description)}</div>` : ''}
      <div class="task-meta">
        <span class="chip priority-${task.priority}">${pLabels[task.priority] || ''}</span>
        ${task.category_name ? `<span class="chip">🏷️ ${esc(task.category_name)}</span>` : ''}
        <span class="chip">#${task.id}</span>
      </div>
    </div>
    <span class="badge ${done ? 'done' : 'pending'}">${done ? '✓ Готово' : '● В работе'}</span>
    <button class="btn-edit" title="Редактировать">✎</button>
    <button class="btn-del" title="Удалить">✕</button>`;
  card.querySelector('.toggle').onclick = () => toggleTask(task, card);
  card.querySelector('.btn-edit').onclick = () => openEditModal(task);
  card.querySelector('.btn-del').onclick = () => deleteTask(task.id, card);
  return card;
}

async function addTask(){
  const title = document.getElementById('t-title').value.trim();
  const desc = document.getElementById('t-desc').value.trim();
  const priority = parseInt(document.getElementById('t-priority').value);
  const cat = document.getElementById('t-category').value;
  if(!title){ toast('Введите название задачи','error'); document.getElementById('t-title').focus(); return; }
  const btn = document.getElementById('btn-add');
  btn.disabled = true; btn.textContent = 'Отправка...';
  try{
    const body = {title, status:0, priority};
    if(desc) body.description = desc;
    if(cat) body.category_id = parseInt(cat);
    const task = await api('POST', '/tasks', body);
    allTasks.unshift(task);
    document.getElementById('t-title').value = '';
    document.getElementById('t-desc').value = '';
    renderTasks(); toast('✦ Задача добавлена!');
  }catch(e){ toast(e.message,'error'); }
  finally{ btn.disabled = false; btn.textContent = '+ Добавить задачу'; }
}

async function deleteTask(id, card){
  if(!confirm('Удалить задачу?')) return;
  card.style.cssText += 'transition:opacity .2s,transform .2s;opacity:0;transform:translateX(28px)';
  try{
    await api('DELETE', '/tasks/' + id);
    allTasks = allTasks.filter(t => t.id !== id);
    setTimeout(renderTasks, 220); toast('Задача удалена');
  }catch(e){ card.style.opacity='1'; card.style.transform=''; toast(e.message,'error'); }
}

async function toggleTask(task, card){
  const newStatus = task.status == 1 ? 0 : 1;
  task.status = newStatus;
  const done = newStatus == 1;
  card.classList.toggle('done', done);
  card.querySelector('.toggle').textContent = done ? '✓' : '';
  const badge = card.querySelector('.badge');
  badge.className = 'badge ' + (done ? 'done' : 'pending');
  badge.textContent = done ? '✓ Готово' : '● В работе';
  document.getElementById('s-done').textContent = allTasks.filter(t => t.status == 1).length;
  document.getElementById('s-active').textContent = allTasks.filter(t => t.status == 0).length;
  try{ await api('PATCH', '/tasks/' + task.id, {status: newStatus}); toast(done ? '✓ Выполнено' : '● Возвращено в работу'); }
  catch{ renderTasks(); }
  if(filterStatus !== 'all') setTimeout(loadTasks, 300);
}

// ── ФИЛЬТРЫ ──
function setFilter(val, btn){
  filterStatus = val;
  document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); loadTasks();
}

function onSearch(){
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchQ = document.getElementById('search-inp').value.trim();
    loadTasks();
  }, 350);
}

// ── УТИЛИТЫ ──
async function api(method, url, body){
  const opts = { method, headers: {'Content-Type': 'application/json'} };
  if(token) opts.headers['Authorization'] = 'Bearer ' + token;
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch(API + url, opts);
  const data = await res.json();
  if(!res.ok) throw new Error(data.detail || 'Ошибка сервера');
  return data;
}

function showLoading(show){
  const list = document.getElementById('task-list');
  const loading = list.querySelector('.loading');
  if(show && !loading) list.innerHTML = '<div class="loading"><div class="spinner"></div><p>Загрузка...</p></div>';
  else if(!show && loading) loading.remove();
}

let tTimer;
function toast(msg, type='success'){
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + type + ' show';
  clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── РЕДАКТИРОВАНИЕ ──
function openEditModal(task) {
  document.getElementById('edit-id').value = task.id;
  document.getElementById('edit-title').value = task.title;
  document.getElementById('edit-desc').value = task.description || '';
  document.getElementById('edit-priority').value = task.priority;
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

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const desc = document.getElementById('edit-desc').value.trim();
  const priority = parseInt(document.getElementById('edit-priority').value);
  const cat = document.getElementById('edit-category').value;
  if (!title) { toast('Введите название', 'error'); return; }
  const body = { title, priority };
  if (desc) body.description = desc;
  if (cat) body.category_id = parseInt(cat);
  try {
    const updated = await api('PATCH', '/tasks/' + id, body);
    const idx = allTasks.findIndex(t => t.id == id);
    if (idx !== -1) allTasks[idx] = updated;
    renderTasks();
    closeEditModal();
    toast('✎ Задача обновлена');
  } catch(e) { toast(e.message, 'error'); }
}
