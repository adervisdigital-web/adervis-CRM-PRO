# CLAUDE.md — ADERVIS CRM

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
**Стек:** Vanilla JS (один IIFE, `app.js` ≈29 000 строк / 1,9 МБ) + Supabase + CSS + PWA.  
**Деплой:** GitHub Pages → `app.adervis.ru`

> Размер и карту §6 сверять раз в несколько заходов: файл растёт быстро, а
> `Get-Content | Measure-Object` на нём ВРЁТ (даёт ~26 800). Честное число —
> `node -e "console.log(require('fs').readFileSync('app.js','utf8').split('\n').length)"`.

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
- **Глобал ровно один — `window.app`** (собирается ~L28308). Все `onclick=` в разметке
  зовут через него; забыл префикс `app.` — кнопка молча мертва
- Все Supabase-запросы через существующий клиент — переменная `_supabase`
  внутри IIFE (объявлена ~L1303). **`window._sb` не существует**, до 03.09.2026
  этот файл называл именно его
- Состояние — переменная `state` внутри IIFE (форма задаётся `defaultState()`, ~L7151),
  синхронизируется через `agency_state`. **`window._state` тоже не существует**
- supabase-js v2 **не бросает исключение**: ошибка приходит в результате, поэтому
  `try/catch` вокруг записи не срабатывает никогда, и отказ выглядит как успех.
  Проверять `error` у КАЖДОЙ записи
- После каждого рендера проверять: не сломался ли VK ID widget, не потерялся ли event listener

### CSS
- Все значения только из переменных `:root` (DESIGN.md §3-4)
- Новые цвета — только через новую переменную, не хардкодить `#hex` в компонентах
- Spacing — числом в px, шаг шкалы 2px (DESIGN.md §4). Переменных `--sp-*` НЕ существует: ссылка на несуществующий токен заставляет браузер молча отбросить всё объявление
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
- Spacing: шаг 2px, числом в px (DESIGN.md §4). `--sp-*` не существует
- Скругления — только токенами `--r-sm/md/lg/xl/2xl/pill` (8/10/12/16/24/999px).
  Пиксельных литералов в `border-radius` в `style.css` **ноль**, так и держать
- Новые компоненты: карточка → `var(--r-xl)`, 1px border `--line`, hover = primary glow
- Числа/суммы: `font-variant-numeric: tabular-nums`, font-weight: 700

---

## 6. Структура app.js (навигация по файлу)

Сверено с файлом 03.09.2026 (29 007 строк). Границы приблизительные — это
ориентир, чтобы не грепать вслепую; точку входа всё равно искать по имени
функции. В самом файле разделы размечены комментариями `/* ═══ ИМЯ ═══ */`.

```
    1–265   — константы (SUPABASE_URL/KEY, VK_APP_ID, YANDEX_CLIENT_ID)
  266–383   — ICON_PATHS + icon() — вся иконочная база
  384–1300  — DEFAULT_STAGES, DEFAULT_PACKAGES, каталог по умолчанию,
              безопасные обёртки localStorage (lsGet/lsSet/lsRemove)
 1300–3175  — Supabase client, сессия, realtime-синхронизация,
              saveToCloud/загрузка облака (2129), способ оплаты аванса (2160)
 3176–4274  — AUTH GATE: handleVKIDSuccess (3532), renderAuthGateEl (4107)
 4275–4374  — уведомления
 4375–5803  — подписка и профиль: PLANS (4392), renderSupport (5226),
              renderPlans (5354), renderProfile (5510)
 5804–6151  — Google Calendar (личное OAuth-подключение)
 6152–6448  — help / онбординг / тур
 6449–7150  — база знаний (renderKnowledge 6480), escapeHtml (6818)
 7151–7754  — defaultState() — форма всего состояния
 7755–8175  — save/load (7755, 7777), toast (7901), confirmDialog (7941)
 8176–8816  — деньги и математика сметы: money (8176), lineBreakdown (8668)
 8817–9450  — totals() (8817), пакеты, слияние своих позиций
 9450–11400 — сделки: обновление, финансы проекта, drag-and-drop карточек
11400–12600 — аналитика по месяцам, финансовые фильтры, модалки финансов
12600–13340 — мастер новой сделки, меню сделки, импорт данных
13341–13875 — экспорт в Excel (_xls*, exportMonthlyReport)
13876–15200 — render() — главный диспетчер (13876); онлайн-брифы (14356)
15201–15620 — редактирование и удаление КП («Все КП»)
15621–16505 — renderBriefs (15621), renderAnalyticsSection (16014)
16506–17635 — renderHome (16506)
17636–18319 — услуги: renderPackages (17636), renderServices/renderCatalog (17875)
18320–19178 — renderEstimate (18320) — смета
19179–19588 — renderClients (19179)
19589–20616 — задачи: renderGlobalTasks (19589), renderTasks (20005),
              renderFinance (20226)
20617–21553 — renderCompanyTeam (20617), renderCalendar (20720), renderCrm (20783)
21554–22916 — renderGlobalFinances (21554), renderGlobalCalendar (22020)
22917–23439 — renderSettings (22917), управление календарём (23417)
23440–24495 — публичный калькулятор смет (?calc=…)
24496–25225 — клиентский портал (?portal=UUID), loadPortalData (24731)
25226–25405 — канбан drag-and-drop, swipe-to-delete, AI-помощник КП (25348)
25406–26464 — главное меню и модалки: транзакция, клиент, сделка, задача
26465–29007 — договоры (renderContracts 27869), напоминания о дедлайнах,
              офлайн-баннер, запись состояния на выгрузке, PWA
```

---

## 7. Память контекста (claude-mem архитектура)

> Заготовка для будущего внедрения persistent memory для клиентов

Суть: каждый клиент (`deal`) накапливает историю взаимодействий. При AI-генерации КП нужен контекст.

**Текущая структура (в Supabase):**
- `client_portals.services_list` — JSONB список услуг (уже есть)
- `client_portals.proposal_note` — текстовые заметки (уже есть)

**РАБОТАЕТ НА ПРОДЕ** (сверено 03.09.2026: `supabase functions list` — `ai-proposal`
ACTIVE версия 10 от 15.07.2026, `supabase secrets list` — `GEMINI_API_KEY` на месте).
До 03.09 здесь стояло «код готов, ждёт ключа» — это была неправда, унаследованная
от решения 08.06:

- Edge Function `ai-proposal` (supabase/functions/ai-proposal/index.ts) — принимает
  данные сделки (клиент, услуги, этапы, сумма), вызывает Gemini API, возвращает
  готовые includedText/excludedText/proposalNote. Подключена в app.js на месте
  старого мока (`generateProposalAI`, ~L25351)
- Провайдер: **Gemini API, бесплатный тариф** (не Claude — пользователь явно
  отказался от платного варианта 2026-06-08, даже от ~50 копеек за генерацию).
  Личные подписки (Gemini/Claude) тут ни при чём — это отдельный продукт от
  API; но у Gemini есть полностью бесплатный тариф для разработчиков
  (aistudio.google.com, ключ без привязки карты)
- Модель: `gemini-2.5-flash-lite` — бесплатный лимит 15 запросов/мин,
  1000 запросов/день, этого с большим запасом хватает на одно агентство.
  Вызов через прямой fetch к `generativelanguage.googleapis.com` (REST), без SDK
- Лимит на триале — 5 генераций. Решает СЕРВЕР (`TRIAL_LIMIT` в Edge Function,
  счётчик в таблице `ai_usage`, RLS без политик = только service_role);
  `AI_PROPOSAL_TRIAL_LIMIT` в app.js (~L4411) лишь бережёт заведомо лишний запрос.
  Копия пары — правится вместе, как цены

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
- **Логов Edge Functions в CLI НЕТ** — в 2.105 у `supabase functions` только
  `list / delete / download / deploy / new / serve`. Смотреть в дашборде.
  Что задеплоено и когда — `supabase functions list`, какие секреты стоят —
  `supabase secrets list` (показывает имена и хэши, не значения)
- Деплой: `git push origin main` → GitHub Pages автоматически
- **`ROADMAP.md`, `PLAN.md`, `NEXT.md`, `PRODUCT.md`, `REFUNDS.md` и планы —
  в `.gitignore`**: их нет в репозитории, только на машине владельца. В свежем
  клоне ссылки на них не разрешатся — это не пропажа. В репозитории намеренно
  остаются `CLAUDE.md`, `DESIGN.md`, `SECURITY.md`, `tests/README.md`
- Регистратор домена `adervis.ru`: **рег.ру** (reg.ru) — туда заходить для правки DNS-записей
- Email-рассылка: **Resend**, домен `app.adervis.ru` подтверждён (DKIM/SPF/MX/DMARC настроены
  в DNS на рег.ру, статус Verified на 2026-06-07) — используется для писем-напоминаний
  о подписке (`subscription-reminder` Edge Function)
- Напоминание об окончании подписки/триала: ежедневный `pg_cron` job
  `subscription-reminder-daily` (07:00 UTC = 10:00 МСК, id=1) дёргает Edge Function
  `subscription-reminder` через `pg_net`. Функция задеплоена с `--no-verify-jwt` и сама
  проверяет заголовок `x-cron-secret` против секрета `CRON_SECRET`; то же значение лежит
  в Vault БД под именем `cron_secret` (читается job'ом через `vault.decrypted_secrets`)
