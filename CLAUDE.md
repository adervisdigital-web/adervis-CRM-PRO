# CLAUDE.md — Adervis PRO

> Системные инструкции для Claude Code на все сессии.
> Sources: Karpathy Guidelines, Get Shit Done workflow, claude-code-best-practice (Boris Cherny).

---

## Язык общения

**Всегда отвечай пользователю на русском языке** — весь текст, вопросы, отчёты о проделанной
работе, объяснения. Продукт делается для российского рынка; англоязычная версия — дело
будущего, не текущих сессий.

---

## О проекте

CRM + калькулятор смет для видеопродакшн агентства. SaaS по подписке.  
**Стек:** Vanilla JS (один IIFE, `app.js` ~10 800 строк) + Supabase + CSS + PWA.  
**Деплой:** GitHub Pages → `app.adervis.ru`

---

## 1. Принципы работы (Karpathy)

1. **Think Before Coding** — перед правкой кода объясни изменение в 1-2 предложениях
2. **Simplicity First** — простейшее решение, которое работает. Не абстрагировать заранее
3. **Surgical Changes** — меняй только то, что относится к задаче. Не рефакторить попутно
4. **Goal-Driven** — каждый шаг ведёт к конкретному результату, не к "улучшению качества"

---

## 2. Рабочий воркфлоу (Get Shit Done)

```
initialize → discuss → plan → execute → verify → ship
```

- **initialize**: прочитай CLAUDE.md + DESIGN.md + последние коммиты
- **discuss**: задай уточняющий вопрос если задача неоднозначна
- **plan**: напиши список изменений до первой правки (≤5 пунктов)
- **execute**: правь файлы строго по плану
- **verify**: проверь что ничего не сломалось (grep, чтение кода)
- **ship**: коммит с осмысленным сообщением

---

## 3. Технические правила

### Код
- **Один файл — один контекст**: `app.js` это IIFE, не добавлять внешние модули ES6 import
- `window.app = {...}` — публичный API, все `onclick=` в HTML вызывают через него
- Все Supabase-запросы через существующий клиент (`window._sb`)
- Состояние хранится в `window._state` и синхронизируется через `agency_state`
- После каждого рендера проверять: не сломался ли VK ID widget, не потерялся ли event listener

### CSS
- Все значения только из переменных `:root` (DESIGN.md §3-4)
- Новые цвета — только через новую переменную, не хардкодить `#hex` в компонентах
- Spacing только из шкалы `--sp-*`
- Никогда не override `!important` без крайней необходимости

### Supabase / Edge Functions
- RLS включён — всегда проверять, нужен ли service_role или достаточно user token
- Edge Functions на TypeScript, deployed через `supabase functions deploy`
- Secrets — только через `supabase secrets set`, никогда не в код

---

## 4. Аудит качества (Vercel / Bencium patterns)

Перед каждым ship-ом мысленно проверить:

**Производительность:**
- [ ] Нет лишних re-render (render() не вызывается без изменений данных)
- [ ] Изображения оптимизированы (avatar_url — base64, размер ≤ 50KB)
- [ ] Service Worker не кэширует API-запросы (только статику)

**Доступность (WCAG 2.1 AA минимум):**
- [ ] Все интерактивные элементы имеют видимый focus-outline
- [ ] Контраст текст/фон ≥ 4.5:1 (AA) или ≥ 7:1 (AAA)
- [ ] Touch-таргеты ≥ 44×44px
- [ ] Формы имеют `<label>` для каждого input

**Безопасность:**
- [ ] Нет `innerHTML` с пользовательскими данными без санитизации
- [ ] URL-параметры (`?brief=`, `?portal=`) только для чтения, не для исполнения кода

---

## 5. Дизайн-правила (ссылка на DESIGN.md)

Все UI-изменения должны следовать `DESIGN.md`:
- Шрифты: DM Sans (UI) + Space Grotesk (числа/заголовки)
- Spacing: только шкала `--sp-*` (4/8/12/16/24/32/48/64px)
- Новые компоненты: карточка → 16px radius, 1px border `--line`, hover = primary glow
- Числа/суммы: `font-variant-numeric: tabular-nums`, font-weight: 700

---

## 6. Структура app.js (навигация по файлу)

```
~L1-50       — константы (SB URL, SB KEY, VK APP ID)
~L50-200     — инициализация, Supabase client, state
~L200-600    — auth (renderAuthGateEl, handleVKIDSuccess, Google OAuth)
~L600-1200   — render() главная, topbar
~L1200-2500  — CRM (deals, kanban, drag-and-drop)
~L2500-4000  — Смета/Калькулятор (services, prices)
~L4000-5500  — Финансы, Задачи (calendar, kanban tasks)
~L5500-6500  — Клиентский портал (?portal=UUID)
~L6500-7000  — Онлайн-бриф (?brief=UUID)
~L7000-8500  — Подписка, ЮKassa, тарифы
~L8500-9500  — Профиль, настройки, аватар
~L9500-10800 — Утилиты (swipe-to-delete, helpers, PWA)
```

---

## 7. Память контекста (claude-mem архитектура)

> Заготовка для будущего внедрения persistent memory для клиентов

Суть: каждый клиент (`deal`) накапливает историю взаимодействий. При AI-генерации КП нужен контекст.

**Текущая структура (в Supabase):**
- `client_portals.services_list` — JSONB список услуг (уже есть)
- `client_portals.proposal_note` — текстовые заметки (уже есть)

**Будущая интеграция (B2 из ROADMAP):**
- Edge Function `ai-proposal` принимает `deal_id` → читает историю сделки → генерирует КП через Claude API
- `ANTHROPIC_API_KEY` → добавить в Supabase secrets
- Модель: `claude-sonnet-4-6` (баланс скорость/качество для генерации текста)

---

## 8. Чего НЕ делать

- ❌ Не переходить на React/Vue/bundler без явного запроса
- ❌ Не разбивать `app.js` на модули (PWA/ServiceWorker зависит от текущей структуры)
- ❌ Не добавлять npm зависимости (проект без package.json — намеренно)
- ❌ Не коммитить `client_secret_*.json` (Google OAuth credentials)
- ❌ Не хардкодить секреты — только Supabase Edge Function secrets
- ❌ Не менять `SUPABASE_URL` / `SUPABASE_KEY` без обновления GitHub Pages secrets

---

## 9. Контакты и ресурсы

- Supabase dashboard: `qzeylogyledmhjpzvgkk`
- Edge Functions logs: `supabase functions logs <name>`
- Деплой: `git push origin main` → GitHub Pages автоматически
- ROADMAP: `ROADMAP.md` (приоритеты A→B→C→D)
- Регистратор домена `adervis.ru`: **рег.ру** (reg.ru) — туда заходить для правки DNS-записей
- Email-рассылка: **Resend**, домен `app.adervis.ru` подтверждён (DKIM/SPF/MX/DMARC настроены
  в DNS на рег.ру, статус Verified на 2026-06-07) — используется для писем-напоминаний
  о подписке (`subscription-reminder` Edge Function)
- Напоминание об окончании подписки/триала: ежедневный `pg_cron` job
  `subscription-reminder-daily` (07:00 UTC = 10:00 МСК, id=1) дёргает Edge Function
  `subscription-reminder` через `pg_net`. Функция задеплоена с `--no-verify-jwt` и сама
  проверяет заголовок `x-cron-secret` против секрета `CRON_SECRET`; то же значение лежит
  в Vault БД под именем `cron_secret` (читается job'ом через `vault.decrypted_secrets`)
