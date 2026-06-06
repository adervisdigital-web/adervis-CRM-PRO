# DESIGN.md — Adervis PRO Design System

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

Строгая шкала на основе 4px grid. **Только эти значения.**

```
4px   — gap внутри badge, inline-элементы
8px   — gap между label и input, мелкие отступы
12px  — padding кнопки (top/bottom), внутри chip
16px  — padding card, отступы в форме
24px  — gap между карточками, section-gap small
32px  — section-gap, отступы страницы
48px  — крупные блоки, mobile safe area
64px  — hero-разделители, страничные заголовки
```

```css
:root {
  --sp-1:  4px;
  --sp-2:  8px;
  --sp-3:  12px;
  --sp-4:  16px;
  --sp-6:  24px;
  --sp-8:  32px;
  --sp-12: 48px;
  --sp-16: 64px;
}
```

---

## 5. Radii (скругления)

```
4px   — badge, tag, chip
8px   — input, select, маленький button
12px  — card secondary
16px  — card primary, modal (текущий --radius: 18px → снизить до 16px)
24px  — bottom sheet, крупные панели
```

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

| Проблема | Файл | Действие |
|---------|------|---------|
| `font-family: Inter` | style.css:64 | → `DM Sans` |
| Google Fonts import | index.html:40 | → `DM Sans` + `Space Grotesk` |
| `--radius: 18px` | style.css:16 | → `16px` |
| Числа в KPI без tabular-nums | style.css | Добавить `font-variant-numeric: tabular-nums` |

---

*Этот файл — единственный источник правды по дизайну. Обновлять при каждом системном изменении.*
