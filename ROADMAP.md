# ADERVIS CRM — Roadmap

## Статус: Продукт готов принимать платежи и удерживать клиентов. Фокус — привлечение и рост
Последнее обновление: 2026-06-21

---

## ✅ Выполнено — фундамент (этапы 1-5)

### Надёжность и безопасность
- [x] RLS-изоляция между агентствами (миграция 20260607000003)
- [x] `yookassa-webhook` защищён от подделки (ревалидация платежа через API ЮKassa + идемпотентность)
- [x] Промокоды учитываются по факту оплаты, а не при создании чекаута
- [x] VK ID — синтетический email, если соцсеть его не передаёт
- [x] Telegram webhook защищён `X-Telegram-Bot-Api-Secret-Token`
- [x] Double-load при старте устранён (guard INITIAL_SESSION)

### Монетизация
- [x] ЮKassa: `create-payment` + `yookassa-webhook`, промокоды
- [x] Автотриал 7 дней при регистрации (любой способ входа)
- [x] Тарифы: ясная страница `renderPlans()` — итоговая сумма, без автосписаний
- [x] Email-напоминания за 3 дня до окончания подписки/триала (Resend + pg_cron 07:00 UTC)
- [x] Лимит AI-генераций на trial: 5 запросов (счётчик `state.aiProposalCount`)

### Авторизация
- [x] Google OAuth, VK ID OAuth
- [x] Supabase email/password

### Аналитика и доверие
- [x] Яндекс.Метрика счётчик `109706942`, цели воронки: `registration` → `trial_started` → `payment_click` → `payment_success`
- [x] Auth gate — история происхождения продукта + «Карта не нужна для пробного периода»
- [x] Карточка «Оставить отзыв» в поддержке

### CRM и сметы
- [x] Канбан сделок, фильтры, bulk-действия (смена статуса, удаление)
- [x] Список/сетка сделок (`setDealView`)
- [x] Онлайн-бриф (`?brief=UUID`), клиентский портал (`?portal=UUID`)
- [x] Смета: каталог, пакеты, версии, drag-and-drop, undo/redo (MAX_UNDO=50)
- [x] Пользовательские пакеты услуг + редактирование
- [x] Мобильная смета: тулбары в строку, поля в `<details>`
- [x] Финансы сделки: быстрое добавление поступления/расхода прямо над таблицей

### КП (коммерческое предложение)
- [x] Клиентский портал (`?portal=UUID`): КП, этапы, одобрение
- [x] AI-генерация текста КП — Edge Function `ai-proposal` (Gemini 2.5 Flash Lite, `GEMINI_API_KEY`)
- [x] Email клиенту со ссылкой на КП (кнопка в табе КП, Edge Function `send-portal-email`)
- [x] PDF-экспорт КП через браузерную печать
- [x] Excel-экспорт

### Telegram-бот
- [x] Полное меню: сделки, финансы, задачи, статистика
- [x] Пошаговое создание сделки через inline-клавиатуру
- [x] Запись поступлений и расходов с привязкой к сделке
- [x] Смена статуса сделки из Telegram
- [x] AI-ассистент в боте
- [x] Уведомления: просмотр КП клиентом, отправка брифа (`agency-notify`)
- [x] Statuses синхронизированы с CRM_STATUSES в app.js

### Уведомления
- [x] Web Push о дедлайнах (`deadline-push-notify`, `web-push-send`)
- [x] Telegram-уведомления (`telegram-notify`)

### Глобальные финансы
- [x] P&L по всем сделкам, фильтры по дате, поиск
- [x] Аналитика: дашборд с ключевыми метриками

### UX
- [x] Мобильное главное меню через логотип/бургер/«Ещё» — единое (дубли удалены)
- [x] Переключатель темы в мобильном меню
- [x] Список/сетка в CRM, поиск по сделкам/клиентам/задачам
- [x] База знаний, Поддержка, Договора

---

## 🎯 Что делать дальше

### Привлечение первых платящих клиентов (организационно, вне кода)
- [ ] Яндекс.Метрика — убедиться что цели воронки приходят на реальных действиях
- [ ] Проверить доставляемость email (Mail.ru, Gmail, Яндекс) — не попадают ли в спам
- [ ] Юридические документы актуальны (Оферта и Политика на `adervis.ru/docs`)
- [ ] Реквизиты ЮKassa `shopId 1375529`, ИНН `592110786536` — соответствие налоговому статусу
- [ ] Собирать отзывы у первых оплативших → на лендинг `adervis.ru`
- [ ] Прямой контакт с видеопродакшн-студиями и фрилансерами (чаты, форумы)
- [ ] Контент про опыт ADERVIS-студии → естественно подводит к продукту
- [ ] Лендинг `adervis.ru` — синхронизировать сообщение с auth gate

### Код — возможные следующие задачи
- [x] **Реферальная программа** — реферальные ссылки, учёт приглашений, бонусы/скидки; `get_referral_stats` RPC подключён к UI
- [x] **Онлайн-оплата аванса в клиентском портале** — ЮKassa виджет в `?portal=UUID`; EF `create-portal-payment` задеплоена; статус аванса в KP-табе; Telegram-уведомление при оплате
- [x] **GIN-индекс на `state_json->telegramChatIds`** — применён в миграции `20260620000001`

---

## ⚠️ Технический долг (не критично)
- [x] Race condition в Telegram-сессиях/сделках/транзакциях (read-modify-write без
  транзакции) — исправлено 03.07.2026: 4 RPC-функции (`bot_session_set/clear`,
  `bot_add_deal`, `bot_add_transaction`, `bot_update_deal_status`) делают
  `SELECT ... FOR UPDATE` + мутацию + `UPDATE` одним атомарным вызовом в Postgres
  вместо select+upsert из Edge Function. Затрагивало не только сессии бота, а весь
  `state_json` blob — параллельный запрос (второе сообщение в Telegram или
  сохранение из веб-CRM) мог затереть чужие изменения. Migration
  `20260703000001_telegram_state_race_fix.sql`, задеплоено.
- ~~EF используют `deno.land/std@0.177.0`~~ — неактуально, все функции уже на
  `Deno.serve()` + `esm.sh/@supabase/supabase-js@2`, без deno.land/std импортов
  (проверено 03.07.2026, было исправлено раньше без записи в этот файл)
- ~~`SUPER_ADMIN_EMAIL` хардкод в client JS~~ — неактуально, email уже base64
  (`atob(...)`) в `_isSuperAdmin()`, реальная проверка прав всегда на сервере
  (`_is_super_admin()` в Postgres); проверено 03.07.2026

---

## Контекст проекта

| Параметр | Значение |
|----------|----------|
| Приложение | https://app.adervis.ru |
| Лендинг | https://adervis.ru |
| Политика конфиденциальности | https://adervis.ru/docs |
| Supabase | qzeylogyledmhjpzvgkk.supabase.co |
| GitHub | adervisdigital-web/adervis-CRM-PRO |
| Super-admin | adervis.digital@gmail.com |
| ЮKassa shopId | 1375529 |
| Яндекс.Метрика ID | 109706942 |
| VK App ID | 54626328 |
| Google Client ID | 341227937040-j9f41teqgu87n0f5qbd0j08qf7u1605d.apps.googleusercontent.com |
| Деплой | GitHub Pages (push в main → автодеплой) |
| Edge Functions | agency-notify, ai-proposal, calendar-feed, create-payment, create-portal-payment, deadline-push-notify, delete-account, send-portal-email, subscription-reminder, telegram-notify, telegram-webhook, vk-auth, web-push-send, welcome-email, yookassa-webhook |
| Стек | Vanilla JS (app.js ~15 000 строк), style.css, Supabase, ЮKassa, Resend |
