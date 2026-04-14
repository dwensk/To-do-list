from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from typing import Optional
import sqlite3, hashlib, secrets, re, os

DB_PATH = os.path.join(os.path.dirname(__file__), "todo.db")

# ---------- БД ----------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = get_db()
    db.execute("""CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT    NOT NULL UNIQUE,
        email         TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        password_salt TEXT    NOT NULL DEFAULT '',
        token         TEXT,
        created_at    TEXT    DEFAULT (datetime('now'))
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS categories (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        name    TEXT    NOT NULL,
        user_id INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )""")
    db.execute("""CREATE TABLE IF NOT EXISTS tasks (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        description TEXT,
        status      INTEGER NOT NULL DEFAULT 0,
        priority    INTEGER NOT NULL DEFAULT 1,
        user_id     INTEGER NOT NULL,
        category_id INTEGER,
        created_at  TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (user_id)     REFERENCES users(id)      ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    )""")
    db.commit()
    db.close()
    yield

app = FastAPI(title="TaskFlow API", version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# Раздача статических файлов (CSS, JS)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.mount("/static", StaticFiles(directory=BASE_DIR), name="static")

security = HTTPBearer(auto_error=False)

# ---------- УТИЛИТЫ ----------
def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    if salt is None:
        salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000)
    return key.hex(), salt

def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    return hash_password(password, salt)[0] == stored_hash

def generate_token() -> str:
    return secrets.token_hex(32)

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)):
    if not credentials:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE token = ?", (credentials.credentials,)).fetchone()
    db.close()
    if not user:
        raise HTTPException(status_code=401, detail="Недействительный токен")
    return dict(user)

# ---------- МОДЕЛИ (с валидацией) ----------
class RegisterModel(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    email: str = Field(..., min_length=5, max_length=100)
    password: str = Field(..., min_length=6, max_length=100)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v):
        if not re.match(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$", v):
            raise ValueError("Неверный формат email")
        return v.lower()

    @field_validator("username")
    @classmethod
    def validate_username(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Только буквы, цифры и _")
        return v

class LoginModel(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)

class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

class CategoryUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)

class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    status: int = Field(0, ge=0, le=1)
    priority: int = Field(1, ge=1, le=3)
    category_id: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    status: Optional[int] = Field(None, ge=0, le=1)
    priority: Optional[int] = Field(None, ge=1, le=3)
    category_id: Optional[int] = None

# ==================== AUTH ====================

@app.post("/auth/register", tags=["Auth"])
async def register(data: RegisterModel):
    """Регистрация нового пользователя"""
    db = get_db()
    if db.execute("SELECT id FROM users WHERE username=? OR email=?", (data.username, data.email)).fetchone():
        raise HTTPException(400, "Пользователь с таким именем или email уже существует")
    token = generate_token()
    pwd_hash, pwd_salt = hash_password(data.password)
    db.execute("INSERT INTO users (username,email,password_hash,password_salt,token) VALUES (?,?,?,?,?)",
               (data.username, data.email, pwd_hash, pwd_salt, token))
    db.commit()
    user_id = db.execute("SELECT id FROM users WHERE username=?", (data.username,)).fetchone()["id"]
    db.close()
    return {"message": "Регистрация успешна", "token": token, "user_id": user_id, "username": data.username}

@app.post("/auth/login", tags=["Auth"])
async def login(data: LoginModel):
    """Вход в систему"""
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE username=?", (data.username,)).fetchone()
    if not user or not verify_password(data.password, user["password_hash"], user["password_salt"]):
        raise HTTPException(401, "Неверное имя пользователя или пароль")
    token = generate_token()
    db.execute("UPDATE users SET token=? WHERE id=?", (token, user["id"]))
    db.commit()
    db.close()
    return {"message": "Вход выполнен", "token": token, "user_id": user["id"], "username": user["username"]}

@app.get("/auth/me", tags=["Auth"])
async def get_me(current_user: dict = Depends(get_current_user)):
    """Информация о текущем пользователе"""
    return {"id": current_user["id"], "username": current_user["username"],
            "email": current_user["email"], "created_at": current_user["created_at"]}

# ==================== USERS ====================

@app.get("/users", tags=["Users"])
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Список всех пользователей (без паролей)"""
    db = get_db()
    users = db.execute("SELECT id, username, email, created_at FROM users ORDER BY id").fetchall()
    db.close()
    return [dict(u) for u in users]

@app.get("/users/{user_id}", tags=["Users"])
async def get_user(user_id: int, current_user: dict = Depends(get_current_user)):
    """Пользователь по ID"""
    db = get_db()
    user = db.execute("SELECT id, username, email, created_at FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    return dict(user)

@app.get("/users/tasks/all", tags=["Users"])
async def get_users_with_tasks(current_user: dict = Depends(get_current_user)):
    """JOIN: пользователи и их задачи"""
    db = get_db()
    rows = db.execute("""
        SELECT u.id as user_id, u.username,
               t.id as task_id, t.title, t.status, t.priority, t.created_at
        FROM users u
        LEFT JOIN tasks t ON t.user_id = u.id
        ORDER BY u.id, t.created_at DESC
    """).fetchall()
    db.close()
    result = {}
    for r in rows:
        uid = r["user_id"]
        if uid not in result:
            result[uid] = {"user_id": uid, "username": r["username"], "tasks": []}
        if r["task_id"]:
            result[uid]["tasks"].append({
                "id": r["task_id"], "title": r["title"],
                "status": r["status"], "priority": r["priority"], "created_at": r["created_at"]
            })
    return list(result.values())

# ==================== CATEGORIES (полный CRUD) ====================

@app.get("/categories", tags=["Categories"])
async def get_categories(current_user: dict = Depends(get_current_user)):
    """Список категорий текущего пользователя"""
    db = get_db()
    cats = db.execute("SELECT * FROM categories WHERE user_id=? ORDER BY name", (current_user["id"],)).fetchall()
    db.close()
    return [dict(c) for c in cats]

@app.get("/categories/{cat_id}", tags=["Categories"])
async def get_category(cat_id: int, current_user: dict = Depends(get_current_user)):
    """Получить категорию по ID"""
    db = get_db()
    cat = db.execute("SELECT * FROM categories WHERE id=? AND user_id=?", (cat_id, current_user["id"])).fetchone()
    db.close()
    if not cat:
        raise HTTPException(404, "Категория не найдена")
    return dict(cat)

@app.post("/categories", tags=["Categories"])
async def create_category(data: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """Создать категорию"""
    db = get_db()
    if db.execute("SELECT id FROM categories WHERE name=? AND user_id=?", (data.name, current_user["id"])).fetchone():
        raise HTTPException(400, "Категория с таким именем уже существует")
    cur = db.cursor()
    cur.execute("INSERT INTO categories (name, user_id) VALUES (?,?)", (data.name, current_user["id"]))
    db.commit()
    new_id = cur.lastrowid
    db.close()
    return {"id": new_id, "name": data.name, "user_id": current_user["id"]}

@app.put("/categories/{cat_id}", tags=["Categories"])
async def update_category(cat_id: int, data: CategoryUpdate, current_user: dict = Depends(get_current_user)):
    """Полное обновление категории (PUT)"""
    db = get_db()
    if not db.execute("SELECT id FROM categories WHERE id=? AND user_id=?", (cat_id, current_user["id"])).fetchone():
        raise HTTPException(404, "Категория не найдена")
    db.execute("UPDATE categories SET name=? WHERE id=?", (data.name, cat_id))
    db.commit()
    db.close()
    return {"id": cat_id, "name": data.name, "user_id": current_user["id"]}

@app.delete("/categories/{cat_id}", tags=["Categories"])
async def delete_category(cat_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить категорию"""
    db = get_db()
    if not db.execute("SELECT id FROM categories WHERE id=? AND user_id=?", (cat_id, current_user["id"])).fetchone():
        raise HTTPException(404, "Категория не найдена")
    db.execute("DELETE FROM categories WHERE id=?", (cat_id,))
    db.commit()
    db.close()
    return {"status": "success", "deleted_id": cat_id}

# ==================== TASKS (полный CRUD) ====================

@app.get("/tasks", tags=["Tasks"])
async def get_tasks(
    search: Optional[str] = None,
    status: Optional[int] = None,
    category_id: Optional[int] = None,
    priority: Optional[int] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Список задач с фильтрацией:
    - search      — поиск по названию (LIKE)
    - status      — 0=активные, 1=выполненные
    - category_id — фильтр по категории
    - priority    — 1=низкий, 2=средний, 3=высокий
    """
    db = get_db()
    query = """SELECT t.*, c.name as category_name
               FROM tasks t LEFT JOIN categories c ON t.category_id=c.id
               WHERE t.user_id=?"""
    params: list = [current_user["id"]]
    if search:
        query += " AND t.title LIKE ?"; params.append(f"%{search}%")
    if status is not None:
        query += " AND t.status=?"; params.append(status)
    if category_id is not None:
        query += " AND t.category_id=?"; params.append(category_id)
    if priority is not None:
        query += " AND t.priority=?"; params.append(priority)
    query += " ORDER BY t.created_at DESC"
    tasks = db.execute(query, params).fetchall()
    db.close()
    return [dict(t) for t in tasks]

@app.get("/tasks/{task_id}", tags=["Tasks"])
async def get_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """Получить задачу по ID"""
    db = get_db()
    task = db.execute(
        "SELECT t.*, c.name as category_name FROM tasks t LEFT JOIN categories c ON t.category_id=c.id WHERE t.id=? AND t.user_id=?",
        (task_id, current_user["id"])
    ).fetchone()
    db.close()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    return dict(task)

@app.post("/tasks", tags=["Tasks"])
async def create_task(data: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Создать задачу"""
    db = get_db()
    if data.category_id and not db.execute(
        "SELECT id FROM categories WHERE id=? AND user_id=?", (data.category_id, current_user["id"])
    ).fetchone():
        db.close(); raise HTTPException(400, "Категория не найдена")
    cur = db.cursor()
    cur.execute("INSERT INTO tasks (title,description,status,priority,user_id,category_id) VALUES (?,?,?,?,?,?)",
                (data.title, data.description, data.status, data.priority, current_user["id"], data.category_id))
    db.commit()
    task = db.execute(
        "SELECT t.*, c.name as category_name FROM tasks t LEFT JOIN categories c ON t.category_id=c.id WHERE t.id=?",
        (cur.lastrowid,)
    ).fetchone()
    db.close()
    return dict(task)

@app.put("/tasks/{task_id}", tags=["Tasks"])
async def replace_task(task_id: int, data: TaskCreate, current_user: dict = Depends(get_current_user)):
    """Полная замена задачи (PUT) — все поля обязательны"""
    db = get_db()
    if not db.execute("SELECT id FROM tasks WHERE id=? AND user_id=?", (task_id, current_user["id"])).fetchone():
        raise HTTPException(404, "Задача не найдена")
    if data.category_id and not db.execute(
        "SELECT id FROM categories WHERE id=? AND user_id=?", (data.category_id, current_user["id"])
    ).fetchone():
        db.close(); raise HTTPException(400, "Категория не найдена")
    db.execute("UPDATE tasks SET title=?,description=?,status=?,priority=?,category_id=? WHERE id=?",
               (data.title, data.description, data.status, data.priority, data.category_id, task_id))
    db.commit()
    task = db.execute(
        "SELECT t.*, c.name as category_name FROM tasks t LEFT JOIN categories c ON t.category_id=c.id WHERE t.id=?",
        (task_id,)
    ).fetchone()
    db.close()
    return dict(task)

@app.patch("/tasks/{task_id}", tags=["Tasks"])
async def update_task(task_id: int, data: TaskUpdate, current_user: dict = Depends(get_current_user)):
    """Частичное обновление задачи (PATCH) — только нужные поля"""
    db = get_db()
    if not db.execute("SELECT id FROM tasks WHERE id=? AND user_id=?", (task_id, current_user["id"])).fetchone():
        raise HTTPException(404, "Задача не найдена")
    updates, params = [], []
    if data.title is not None:       updates.append("title=?");       params.append(data.title)
    if data.description is not None: updates.append("description=?"); params.append(data.description)
    if data.status is not None:      updates.append("status=?");      params.append(data.status)
    if data.priority is not None:    updates.append("priority=?");    params.append(data.priority)
    if data.category_id is not None: updates.append("category_id=?"); params.append(data.category_id)
    if updates:
        params.append(task_id)
        db.execute(f"UPDATE tasks SET {', '.join(updates)} WHERE id=?", params)
        db.commit()
    task = db.execute(
        "SELECT t.*, c.name as category_name FROM tasks t LEFT JOIN categories c ON t.category_id=c.id WHERE t.id=?",
        (task_id,)
    ).fetchone()
    db.close()
    return dict(task)

@app.delete("/tasks/{task_id}", tags=["Tasks"])
async def delete_task(task_id: int, current_user: dict = Depends(get_current_user)):
    """Удалить задачу"""
    db = get_db()
    if not db.execute("SELECT id FROM tasks WHERE id=? AND user_id=?", (task_id, current_user["id"])).fetchone():
        raise HTTPException(404, "Задача не найдена")
    db.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    db.commit()
    db.close()
    return {"status": "success", "deleted_id": task_id}

# ==================== FRONTEND ====================

@app.get("/", response_class=HTMLResponse, include_in_schema=False)
async def serve_frontend():
    html_path = os.path.join(BASE_DIR, "index.html")
    if os.path.exists(html_path):
        return open(html_path, encoding="utf-8").read()
    return "<h1>Фронтенд не найден. Используйте <a href='/docs'>/docs</a></h1>"

@app.get("/style.css", include_in_schema=False)
async def serve_css():
    return FileResponse(os.path.join(BASE_DIR, "style.css"), media_type="text/css")

@app.get("/script.js", include_in_schema=False)
async def serve_js():
    return FileResponse(os.path.join(BASE_DIR, "script.js"), media_type="application/javascript")
