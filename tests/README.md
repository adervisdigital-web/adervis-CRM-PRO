# tests/ — локальные Playwright-регресс-тесты ADERVIS CRM

Формализация Фазы F дорожной карты (пп.18-20): переиспользуемый набор, который
гоняет `app.js` в браузере через local-mode-обход (`adervis_local_mode`) и ловит
регрессии до жалоб пользователей.

## Запуск

```bash
node tests/run.js            # все наборы
node tests/run.js modals     # один набор: smoke | responsive | modals | interactions | assets | a11y | money
```

Exit code = число упавших проверок (0 = всё зелёно) — годится для pre-push / CI.

## Зачем без package.json

Правило проекта — **репозиторий без `package.json` и без `node_modules`**
(CLAUDE.md §8: vanilla-JS + PWA, никакого сборщика). Поэтому:

- **Статический сервер** (`server.js`) — только встроенные модули Node (`http/fs/path`),
  ноль зависимостей. Playwright-у нужен реальный http-origin: на `file://` не работают
  `localStorage`, Service Worker и CSP.
- **Playwright не устанавливается в репо.** `harness.js` → `loadPlaywright()` сам находит
  уже установленный модуль (обычный `require`, затем npx-кэш `_npx/*/node_modules`,
  затем `npm root -g`). Репо остаётся чистым, а `node tests/run.js` работает из коробки
  на машине, где Playwright хоть раз запускался.

Если Playwright не найден — установите его один раз (глобально, вне репо):

```bash
npx playwright install chromium
```

## Что покрыто

| Набор          | Пункт | Проверяет |
|----------------|-------|-----------|
| `smoke`        | —     | Local mode поднимает UI без ошибок; auth gate показывает CTA без local mode |
| `responsive`   | п.18  | Ноль горизонтального переполнения на 320/360/480/640/768/900px (home/catalog/crm/clients/tasks) + снимок каталога на 320px |
| `modals`       | п.20  | Обход модалок (client/finance/help/mainMenu/admin/deal/catalog/package): `role=dialog` + `aria-modal` + `aria-label` + фокус внутри + возврат фокуса при закрытии + скриншот каждой |
| `interactions` | I/H   | Undo-тост при удалении (появление «Отменить» + восстановление) и смена этапа канбана через `setKanbanStatus` с персистентностью |
| `assets`       | G     | Self-host шрифтов (нет Google Fonts), SRI на CDN-скриптах, ленивый xlsx, `defer`, CSP `font-src 'self'` |
| `money`        | H     | **Арифметика денег** на заданном вручную состоянии: долг клиентов, выручка/расходы/прибыль месяца, собираемость без архивных сделок, отсутствие задвоения при открытой сделке, поступление через модалку финансов |

`money` стоит особняком: он не проверяет вид, он проверяет **числа**. Состояние задаётся
вручную (`seedDeals()` в `suites/money.js`), ожидания посчитаны на бумаге — три сделки:
частично оплачена, оплачена полностью, архивная. Именно в этих метриках баги повторялись
чаще всего (архивные сделки в «Обороте» правились четыре раза), поэтому при любой правке
финансовых агрегатов набор надо расширять, а не переписывать.

Скриншоты пишутся в `tests/screenshots/` (в `.gitignore`).

## Как устроено

- `server.js` — статический сервер над корнем репо (`startServer(root, port=0)`).
- `harness.js` — `loadPlaywright()`, `bootLocal(browser, baseUrl, {width,height,seedDemo})`
  (ставит `adervis_local_mode=1` через `addInitScript` до загрузки, ждёт наполнения
  `#appContent`, опционально сеет демо-сделку через `window.app.seedDemoDeal()`),
  мини-фреймворк `Suite`/`assert`.
- `run.js` — поднимает сервер, запускает Chromium, гоняет наборы из `suites/`, печатает
  сводку, выставляет exit code.
- `suites/*.js` — по одному файлу на набор; каждый экспортирует
  `async ({ browser, baseUrl, test, shotDir }) => { … }`.

### Важные факты для тестов

- Корень контента — `#appContent`, контейнер модалок — `#modalContainer`.
- `window.state` **не** экспонирован (IIFE-замыкание) — id сущностей берём из DOM
  (`onclick="…openDeal('id')"`), а не из состояния.
- Local mode минует auth gate и subscription gate; облачные вызовы (`saveToCloud`) в нём
  no-op (нет `_adminSession`), поэтому консоль чистая.
- Демо-сделка (`seedDemo`) рендерит карточку с `openDeal('id')` **на главной**
  (в CRM-канбане разметка другая).
