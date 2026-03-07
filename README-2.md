# TaskFlow — Менеджер задач

Веб-приложение для управления задачами. Backend: **FastAPI + SQLite**.  
Frontend встроен в `main.py`, открывается по адресу `http://localhost:8000`.

---

## Технологии

| Слой | Инструмент |
|------|-----------|
| Backend | Python 3.10+, FastAPI |
| База данных | SQLite (встроена в Python) |
| Авторизация | Bearer Token (секретный токен в заголовке) |
| Хеширование паролей | PBKDF2-HMAC-SHA256 |
| Frontend | HTML + CSS + JS (встроен) |

---

## Установка и запуск

### 1. Требования
- Python 3.10 или выше

### 2. Установить зависимости
```bash
pip install fastapi uvicorn
```

### 3. (Опционально) Создать БД с тестовыми данными
```bash
python sql.py
```
Создаёт `todo.db` и добавляет тестовых пользователей:
- `admin` / `admin123`
- `alice` / `pass123`

### 4. Запустить сервер
```bash
python -m uvicorn main:app --reload
```

### 5. Открыть приложение
- Фронтенд: http://localhost:8000
- Swagger UI (документация API): http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## Схема базы данных (3 связанные таблицы)

```
users
├── id            INTEGER PK AUTOINCREMENT
├── username      TEXT UNIQUE NOT NULL
├── email         TEXT UNIQUE NOT NULL
├── password_hash TEXT NOT NULL        ← PBKDF2-HMAC-SHA256
├── password_salt TEXT NOT NULL
├── token         TEXT                 ← Bearer-токен
└── created_at    TEXT

categories
├── id      INTEGER PK AUTOINCREMENT
├── name    TEXT NOT NULL
└── user_id INTEGER FK → users.id      ← One-to-Many

tasks
├── id          INTEGER PK AUTOINCREMENT
├── title       TEXT NOT NULL
├── description TEXT
├── status      INTEGER (0=активная, 1=выполнена)
├── priority    INTEGER (1=низкий, 2=средний, 3=высокий)
├── user_id     INTEGER FK → users.id      ← One-to-Many
├── category_id INTEGER FK → categories.id ← One-to-Many (nullable)
└── created_at  TEXT
```

**Связи:**
- `users` → `tasks`: один пользователь — много задач
- `users` → `categories`: один пользователь — много категорий
- `categories` → `tasks`: одна категория — много задач

---

## API Эндпоинты

> Все эндпоинты (кроме `/auth/register` и `/auth/login`) требуют заголовок:  
> `Authorization: Bearer <ваш_токен>`

### Auth — Аутентификация

| Метод | URL | Описание | Тело запроса |
|-------|-----|----------|--------------|
| POST | `/auth/register` | Регистрация | `username, email, password` |
| POST | `/auth/login` | Вход | `username, password` |
| GET  | `/auth/me` | Текущий пользователь | — |

**Пример регистрации:**
```json
POST /auth/register
{
  "username": "ivan",
  "email": "ivan@mail.com",
  "password": "secret123"
}
```
**Ответ:**
```json
{ "message": "Регистрация успешна", "token": "abc123...", "user_id": 1, "username": "ivan" }
```

---

### Users — Пользователи

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/users` | Все пользователи |
| GET | `/users/{id}` | Пользователь по ID |
| GET | `/users/tasks/all` | JOIN: пользователи + задачи |

---

### Categories — Категории (полный CRUD)

| Метод | URL | Описание | Тело |
|-------|-----|----------|------|
| GET    | `/categories`       | Список категорий | — |
| GET    | `/categories/{id}`  | Одна категория   | — |
| POST   | `/categories`       | Создать          | `name` |
| PUT    | `/categories/{id}`  | Полное обновление | `name` |
| DELETE | `/categories/{id}`  | Удалить          | — |

---

### Tasks — Задачи (полный CRUD + поиск и фильтрация)

| Метод | URL | Описание | Тело |
|-------|-----|----------|------|
| GET    | `/tasks`          | Список (с фильтрами) | — |
| GET    | `/tasks/{id}`     | Одна задача | — |
| POST   | `/tasks`          | Создать | `title, description?, status, priority, category_id?` |
| PUT    | `/tasks/{id}`     | Полная замена | все поля |
| PATCH  | `/tasks/{id}`     | Частичное обновление | любые поля |
| DELETE | `/tasks/{id}`     | Удалить | — |

**Параметры фильтрации GET /tasks:**
```
/tasks?search=отчёт          — поиск по названию
/tasks?status=0              — только активные
/tasks?status=1              — только выполненные
/tasks?priority=3            — только высокий приоритет
/tasks?category_id=1         — по категории
/tasks?search=купить&status=0 — комбинация
```

**Пример создания задачи:**
```json
POST /tasks
Authorization: Bearer abc123...

{
  "title": "Написать отчёт",
  "description": "Ежеквартальный финансовый отчёт",
  "status": 0,
  "priority": 3,
  "category_id": 1
}
```

---

## Структура проекта

```
taskflow/
├── main.py          ← FastAPI приложение (API + встроенный фронтенд)
├── sql.py           ← Создание БД и тестовые данные
├── todo.db          ← SQLite база данных (создаётся автоматически)
├── requirements.txt ← Зависимости
├── README.md        ← Документация
└── .gitignore       ← Игнор-файл
```

---

## Зависимости

```
fastapi>=0.100.0
uvicorn>=0.23.0
```

Установка:
```bash
pip install fastapi uvicorn
```
