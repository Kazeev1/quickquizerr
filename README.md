# TestPad — Платформа для создания тестов с ИИ

## Требования

- **Node.js 20+** — [Скачать с nodejs.org](https://nodejs.org/en/download)
- **Ключ OpenAI API** — [Получить на platform.openai.com](https://platform.openai.com/api-keys)

---

## Установка и запуск

### 1. Установите Node.js

Скачайте и установите **Node.js LTS** с https://nodejs.org/  
После установки перезапустите терминал.

### 2. Настройте API-ключ

Откройте файл `backend/.env` и замените:
```
ANTHROPIC_API_KEY=your-anthropic-api-key-here
```
на ваш реальный ключ.

### 3. Установите зависимости

```powershell
# В папке TestPad запустите:
npm install
npm run install:all
```

Или по отдельности:
```powershell
cd backend
npm install

cd ../frontend
npm install
```

### 4. Запуск

```powershell
# Запустить оба сервера (бэкенд + фронтенд):
npm run dev
```

Или по отдельности:
```powershell
# Терминал 1 — бэкенд:
cd backend
npm run dev

# Терминал 2 — фронтенд:
cd frontend
npm run dev
```

### 5. Открыть в браузере

- **Приложение:** http://localhost:5173
- **API:** http://localhost:3001/api

---

## Учётные данные администратора

| Email | Пароль |
|-------|--------|
| admin@testpad.com | admin123 |

> Смените пароль после первого входа (через `backend/.env`)

---

## Структура проекта

```
TestPad/
├── backend/                # Node.js + Express API
│   ├── src/
│   │   ├── db/init.js      # SQLite база данных
│   │   ├── middleware/     # JWT авторизация
│   │   ├── routes/         # API маршруты
│   │   └── services/       # ИИ и обработка файлов
│   ├── data/               # База данных (создаётся автоматически)
│   └── .env                # Конфигурация
│
├── frontend/               # React + TypeScript + Tailwind
│   └── src/
│       ├── pages/          # Страницы приложения
│       ├── components/     # Компоненты
│       ├── contexts/       # Auth контекст
│       └── api/            # API клиент
│
└── package.json            # Корневой скрипт запуска
```

---

## Функции

| Функция | Описание |
|---------|----------|
| **Регистрация / Вход** | JWT авторизация |
| **Создание из файла** | PDF, DOC, DOCX → ИИ извлекает вопросы |
| **Обнаружение изображений** | Предупреждение при наличии изображений в документе |
| **Ручное создание** | Добавление вопросов и ответов вручную |
| **Проверка ИИ** | Вопросы с низкой уверенностью отправляются на проверку |
| **Режим теста** | Перемешанные вопросы и ответы |
| **Режим экзамена** | 30 случайных вопросов |
| **Результаты** | Счёт, время, разбор ошибок |
| **Редактирование** | Редактирование вопросов и ответов |
| **Дубликаты** | Проверка по хэшу файла |
| **Публичный / Приватный** | Контроль доступа к тесту |
| **Админ-панель** | Управление пользователями, тестами, логами |

---

## Конфигурация `.env`

```env
PORT=3001
FRONTEND_URL=http://localhost:5173
JWT_SECRET=смените-на-случайную-строку
OPENAI_API_KEY=ваш-ключ-здесь
ADMIN_EMAIL=admin@testpad.com
ADMIN_PASSWORD=admin123
```

---

## Технический стек

**Backend:** Node.js · Express · SQLite (better-sqlite3) · JWT · Multer · pdf-parse · Mammoth · OpenAI SDK (gpt-4.1-nano)  
**Frontend:** React 18 · TypeScript · Vite · Tailwind CSS · React Router · Axios · Lucide Icons
