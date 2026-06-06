# Adervis CRM PRO — Roadmap

## Статус: В работе
Последнее обновление: 2026-06-07

---

## ✅ Выполнено

### Инфраструктура
- ЮKassa интеграция (Edge Functions задеплоены, вебхук настроен)
- Super-admin bypass для adervis.digital@gmail.com
- Supabase блок в настройках скрыт от обычных пользователей
- Google Fonts Inter, Open Graph теги, Yandex.Metrica заглушка
- Автоопределение темы (prefers-color-scheme)
- Error boundary — try/catch в render()
- Service Worker v2 — кеш статики, PWA

### UI/UX
- Красивый экран входа — лендинг слева, форма справа
- Страница поддержки / Контакты
- Интерактивный тур (6 слайдов)
- Скелетон-анимации загрузки

### Функции продукта
- [x] Онлайн-бриф для клиентов (?brief=UUID → форма → автосоздание сделки)
- [x] Клиентский портал (?portal=UUID → read-only КП, кнопка утверждения) — SQL ✅
- [x] Drag-and-Drop Kanban — HTML5 DnD для CRM и Tasks
- [x] AI-помощник для КП — mock (2.4с задержка, премиум-текст, кнопка ✨)
- [x] Swipe-to-delete — мобильный свайп влево для удаления задач
- [x] VK ID OAuth — One Tap кнопка, Edge Function vk-auth задеплоена, работает ✅
- [x] Google OAuth — работает ✅, проект ADERVIS CRM в Google Cloud, брендинг настроен

---

## ⚠️ Мелкие задачи (не критично)

- **Service Worker** — `sw.js:54 Response body is already used` (не мешает работе)
- **Yandex.Metrica** — заменить `99999999` на реальный ID в index.html строка ~55

---

## 📋 План — 15 пунктов (следующие сессии)

### Приоритет 1 — Монетизация и удержание
- [ ] **1. Автотриал при регистрации** — новый юзер автоматически получает 14 дней trial без ручного редактирования в Supabase. Trigger на таблице profiles или хук после signup.
- [ ] **2. Email при окончании подписки** — за 3 дня до конца отправлять письмо через Supabase Edge Function + Resend/SMTP.
- [ ] **3. Промокоды** — поле ввода промокода при оплате, таблица promo_codes в Supabase, скидка % от цены тарифа.

### Приоритет 2 — Уведомления
- [ ] **4. Telegram-бот** — Edge Function telegram-notify, BotFather токен в Secrets. Юзер вводит chat_id в профиле. Уведомления: просроченные задачи, смена статуса сделки, оплата.
- [ ] **5. Web Push уведомления** — браузерные push о дедлайнах задач. Service Worker уже есть, добавить подписку на push.

### Приоритет 3 — Продуктивность
- [ ] **6. Учёт времени на задачах** — кнопка таймер старт/стоп на карточке задачи. Ставка в час в настройках. Итого по проекту/сделке.
- [ ] **7. Реальный AI для КП** — заменить mock на настоящий Claude API. Edge Function ai-proposal, ANTHROPIC_API_KEY в Supabase Secrets. Генерирует текст КП по услугам и сумме.
- [ ] **8. Комментарии в задачах** — треды комментариев внутри карточки задачи, хранятся в отдельной таблице task_comments.

### Приоритет 4 — UX и CRM
- [ ] **9. Массовые действия в CRM** — чекбоксы на карточках сделок, выбрать несколько → переместить в колонку / удалить.
- [ ] **10. Фильтры и поиск в финансах** — фильтр по периоду, по типу (доход/расход), поиск по описанию.
- [ ] **11. Экспорт КП в PDF** — Edge Function html-to-pdf (puppeteer или wkhtmltopdf), кнопка "Скачать PDF" в клиентском портале.
- [ ] **12. Дашборд / аналитика** — виджеты: выручка за месяц, сделки по статусам, задачи в работе. Графики на canvas.

### Приоритет 5 — Клиентская часть
- [ ] **13. Email-уведомление клиенту при создании КП** — при генерации portal-ссылки автоматически отправлять письмо клиенту с кнопкой "Посмотреть предложение".
- [ ] **14. Онлайн-оплата в клиентском портале** — кнопка "Оплатить аванс" прямо в портале, ЮKassa виджет, оплата привязывается к сделке.
- [ ] **15. Мобильное приложение (PWA установка)** — баннер "Добавить на экран" на iOS и Android, правильный manifest, инструкция при первом входе с мобильного.

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
| VK App ID | 54626328 |
| Google Client ID | 341227937040-j9f41teqgu87n0f5qbd0j08qf7u1605d.apps.googleusercontent.com |
| Google Cloud проект | ADERVIS CRM (аккаунт adervis.digital@gmail.com) |
| Деплой | GitHub Pages (push в main → автодеплой) |
| Edge Functions | create-payment, yookassa-webhook, vk-auth |
| Стек | Vanilla JS (app.js ~10 800 строк), style.css, Supabase, ЮKassa |
