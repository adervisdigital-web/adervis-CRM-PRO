# DESIGN.md — ADERVIS CRM Design System

> Sources: Refactoring UI, Frontend Design Pro Demo (Dark OLED), Interface Design system.md pattern, Awesome DESIGN.md (Stripe/Apple references)

---

## 1. Эстетика

**Стиль:** Dark OLED Professional — не игровой Cyberpunk, а инструментальная темнота уровня Linear/Stripe/Vercel.  
Высокий контраст, чёткая иерархия, никакого лишнего декора.

---

## 2. Типографика

### Запрещённые шрифты
❌ Inter — используется сейчас, **заменить**  
❌ Roboto, Arial, system-ui как основной

### Целевая пара
| Роль | Шрифт | Использование |
|------|-------|--------------|
| UI / интерфейс | **DM Sans** (400, 500, 600) | Все текстовые элементы интерфейса |
| Числа / акцент | **Space Grotesk** (600, 700) | Суммы, заголовки H1-H2, KPI-карточки |
| Моно / код | **JetBrains Mono** | UUID, коды, техн. данные |

```css
/* Google Fonts — заменить текущий Inter */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@600;700&family=JetBrains+Mono:wght@400&display=swap');

:root {
  --font-ui: 'DM Sans', ui-sans-serif, sans-serif;
  --font-display: 'Space Grotesk', ui-sans-serif, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

### Шкала размеров (rem / px)
```
12px — мелкий label, badge, timestamp
14px — body, input, кнопка
16px — body-lg, карточка заголовок
20px — H3 / секция
24px — H2 / страница заголовок
32px — H1 / hero / сумма KPI
```

### Веса
- 400 — body текст, описания
- 500 — интерфейсные метки, пункты меню
- 600 — заголовки секций, кнопки
- 700 — цифры (суммы, счётчики), H1

---

## 3. Цвет

### Базовая палитра (CSS custom properties — дополнять, не заменять)

```css
:root {
  /* --- Backgrounds --- */
  --bg:    #070b14;        /* OLED black-navy */
  --bg2:   #0d1424;        /* surface level 1 */
  --bg3:   #111827;        /* surface level 2 (cards, panels) */

  /* --- Text --- */
  --text:  #e8eaf0;        /* primary — чуть теплее нейтрального */
  --muted: #6b7a99;        /* secondary */
  --hint:  #3d4a66;        /* placeholder, disabled */

  /* --- Brand --- */
  --primary:   hsl(265, 82%, 58%);   /* #7c3aed violet */
  --primary2:  hsl(280, 85%, 68%);   /* #a855f7 lighter */
  --primary-bg: hsl(265, 82%, 8%);   /* subtle glow bg */

  /* --- Semantic --- */
  --success: hsl(142, 71%, 35%);    /* #16a34a */
  --warning: hsl(38, 92%, 40%);     /* #ca8a04 */
  --danger:  hsl(0, 72%, 51%);      /* #dc2626 */
  --info:    hsl(199, 89%, 37%);    /* #0891b2 */

  /* --- Structure --- */
  --line:   rgba(148, 163, 184, 0.12);
  --glass:  rgba(13, 20, 36, 0.85);
  --shadow: 0 24px 64px rgba(0, 0, 0, 0.48);
}
```

### Правила применения цвета
- Акцент (`--primary`) — только на 1 интерактивном элементе на экране (CTA-кнопка)
- Статусные цвета — только для смысла (зелёный = успех, красный = опасность)
- Текст на тёмном фоне — минимум `--text` (#e8eaf0) на `--bg` (#070b14): контраст ≥ 7:1 (WCAG AAA)
- Никогда не использовать чистый `#ffffff` на `#000000` — слишком резко

---

## 4. Spacing (отступы)

Шаг шкалы — **2px**, не 4px. Это описание приведено в соответствие с кодом
13.08.2026: раньше здесь была объявлена «строгая шкала 4/8/12/16/24/32/48/64 —
только эти значения», и она не выполнялась ни на одном экране.

Замер по style.css (padding / margin / gap): **10px — самое частое значение в
файле, 127 раз**; 8px — 94, 12px — 75, 6px — 72, 4px — 63, 14px — 58, 2px — 56,
16px — 53, 5px — 32, 18px — 28, 7px — 27, 9px — 20. То есть «вне шкалы»
оказывалось больше значений, чем внутри неё, и самое употребимое из них — 10px.

Переписывать под документ пришлось бы около 380 значений, изменив вид почти
каждого экрана ради правила, которое никто не соблюдал. Правило исправлено под
факт: **шаг 2px, значения кратны двум**. Нечётные (3, 5, 7, 9) — точечные
компенсации оптики (зазор у иконки, подгонка базовой линии), их немного и
плодить их не нужно.

```
2px   — микрозазор: точка статуса и текст, иконка в капсуле
4px   — gap внутри badge, inline-элементы
6px   — gap в плотных строках, чипы фильтров
8px   — label и поле, мелкие отступы
10px  — самый ходовой отступ: padding строк, gap в карточках
12px  — padding кнопки, внутри chip
14px  — padding карточки в плотных списках
16px  — padding панели, отступы в форме
18px  — padding шапки сделки и заголовков секций
24px  — gap между карточками
32px  — отступы страницы, section-gap
```

> **Переменных `--sp-*` НЕ СУЩЕСТВУЕТ.** Здесь много месяцев висел блок `:root`
> с `--sp-1 … --sp-16`, которого нет в style.css ни в каком виде. Он опасен не
> тем, что бесполезен: `padding: var(--sp-2)` при отсутствующей переменной
> заставляет браузер МОЛЧА отбросить объявление целиком, и отступ становится
> нулевым. Ровно так в этом приложении однажды пропал фон у всплывашки
> онбординг-тура (`var(--card)`), и она рисовалась прозрачной.
> Отступы задаются числом в px. Сторож на ссылки к несуществующим токенам —
> в `tests/suites/assets.js`.

---

## 5. Radii (скругления)

```
--r-xs    4px   — badge, tag, chip
--r-sm    8px   — input, select, маленький button
--r-md   10px   — мелкие внутренние элементы (вне спеки, исторический)
--r-lg   12px   — card secondary, контролы и вторичные строки
--r-xl   16px   — card primary, modal, поповер
--r-2xl  24px   — bottom sheet, крупные standalone-панели
                  (экран входа, страница брифа, портал клиента)
--r-pill 999px  — таблетки и круглые кнопки
```

**В коде только эти токены.** Пиксельных литералов в `border-radius` не осталось
ни одного (11.08.2026); допустимы лишь `50%` для кругов и `0`. Легаси-токен
`--radius` удалён — он дублировал `--r-xl`. Закреплено сторожем
`скругления: только токены шкалы, без пиксельных литералов` в `tests/suites/assets.js`.

---

## 6. Компоненты — правила

### Кнопки
```
Primary:   bg=--primary, color=#fff, font-weight:600, padding:12px 24px, radius:8px
Secondary: bg=transparent, border:1px solid --line, color:--text, hover: bg=--bg3
Danger:    bg=transparent, color:--danger, border:1px solid --danger
```
- Минимальная ширина кнопки — 120px
- Минимальная высота — 44px (touch target)
- Никогда не использовать `cursor:pointer` через JS — только на `<button>` и `<a>`

### Карточки (Cards)
```css
.card {
  background: var(--bg3);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: var(--sp-4);         /* 16px */
  box-shadow: 0 4px 24px rgba(0,0,0,0.24);
}
.card:hover {
  border-color: rgba(124, 58, 237, 0.3);  /* subtle primary glow */
}
```

### Inputs
```css
/* high-contrast, no glassmorphism на input */
background: var(--bg2);
border: 1px solid var(--line);
border-radius: 8px;
padding: 10px 14px;
font-size: 14px;
/* Focus: */
outline: 2px solid var(--primary);
outline-offset: 2px;
```

### Числа / суммы (KPI)
```css
font-family: var(--font-display);  /* Space Grotesk */
font-weight: 700;
font-variant-numeric: tabular-nums;
letter-spacing: -0.02em;
```

---

## 7. Motion (анимации)

- **Duration:** 150ms (micro), 250ms (transition), 400ms (modal/sheet)
- **Easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — Material standard
- Skeleton shimmer: `1.5s` infinite
- **Запрет:** никакого `animation: spin` на кнопках (это loading → spinner отдельный элемент)
- `prefers-reduced-motion` — обязательно обрабатывать

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 8. Иконки

- Библиотека: **Lucide** (уже внедряемая тенденция) или inline SVG
- Размер: 16px (inline), 20px (nav/button), 24px (featured)
- Цвет: наследовать `currentColor`
- Никогда не масштабировать PNG иконки

---

## 9. Мобильный UX

- Touch target минимум: **44×44px**
- Bottom nav: фиксированный, `backdrop-filter: blur(16px)`, `safe-area-inset-bottom`
- Swipe-to-delete зона: **min 120px** хода, `40%` экрана = подтверждение
- Модалки снизу вверх (bottom sheet), не из центра

---

## 10. Что сейчас нужно изменить в коде

Все пункты из предыдущей версии этого раздела (шрифт Inter→DM Sans, Google Fonts import,
`--radius` 18px→16px, tabular-nums для KPI-чисел) актуализированы и подтверждены
исправленными на 02.07.2026 — код уже соответствует §3-4. Раздел пуст до следующего
системного изменения дизайна.

### hex → токены (03.07.2026)

Добавлены семантические токены статус-текста и вспомогательные:
```css
--text-success / --text-danger / --text-info / --text-warning  /* цвет текста статусов, per-theme */
--green-strong / --blue-strong                                  /* тёмный оттенок для hover кнопок, не меняется по теме */
--on-color                                                       /* текст на насыщенном/цветном фоне (кнопки, бейджи), #fff в обеих темах */
```
~50 хардкод-hex в style.css заменены на `var()` (было 162 вхождения → 80, из которых
большинство — сами определения токенов, print-контекст `#printArea`/`.proposal-preview`
(намеренно белая бумага вне тем), палитра `.pkg-cat-badge` (8 самостоятельных
категорийных цветов — не статусные, оставлены как связная система) и бренд-цвет VK
(`#0077ff` — чужой брендгайд, не наш токен).
**app.js не трогали** — там hex это inline `style=""` в шаблонах рендера по всему файлу
(Google-брендcolors G-логотипа входят туда же, их менять нельзя), вынос в токены
означал бы перевод на CSS-классы в десятках функций — отдельная большая задача, не
входящая в точечный audit-triage.

### !important — разбор (03.07.2026)

Убраны 3 избыточных (`input.input-error`, `.scroll-top-btn:hover`, `#adminTopbar` —
специфичность уже побеждала без них). Остальные ~36 — **осознанно оставлены**:
большая часть кода написана в порядке «адаптивный оверрайд объявлен РАНЬШЕ базового
правила компонента» (например, `.topbar{display:flex}` в `@media(min-width:769px)`
на строке ~523 стоит до `.topbar{display:grid}` на строке ~591 — без `!important`
базовое правило тихо перекрыло бы десктопный layout). Похожий паттерн — hover-состояния
против `[data-theme="light"]`-переопределений с более высокой специфичностью, и
статусные бейджи (`.db-kpi-warn`) против hover того же уровня вложенности.
**Технический долг**: если когда-нибудь будет большая реорганизация CSS — переставить
базовые правила компонентов ПЕРЕД их адаптивными/state-оверрайдами по файлу, тогда
большинство этих `!important` станут не нужны. Не делать это сейчас — слишком высокий
риск визуальной регрессии ради косметической выгоды (нарушение "surgical changes").

---

*Этот файл — единственный источник правды по дизайну. Обновлять при каждом системном изменении.*
