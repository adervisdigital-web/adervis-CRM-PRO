# Подключение ЮKassa — пошаговая инструкция

## 1. Регистрация в ЮKassa

1. Зайдите на https://yookassa.ru и нажмите **Подключить**
2. Укажите статус — **Самозанятый**
3. Пройдите верификацию (потребуется привязать счёт в банке и подтвердить личность)
4. После одобрения в личном кабинете → **Настройки → Ключи API**
5. Запишите **shopId** и **secretKey**

---

## 2. SQL-миграция (один раз)

Выполните в Supabase Dashboard → SQL Editor:

```sql
alter table public.profiles
  add column if not exists yookassa_last_payment_id text;
```

Или примените файл: `supabase/migrations/20260605000000_add_yookassa_payment_id.sql`

---

## 3. Задеплоить Edge Functions

Установите Supabase CLI (если не установлен):
```bash
npm install -g supabase
```

Авторизуйтесь и свяжите проект:
```bash
supabase login
supabase link --project-ref qzeylogyledmhjpzvgkk
```

Задеплойте обе функции:
```bash
supabase functions deploy create-payment
supabase functions deploy yookassa-webhook
```

---

## 4. Добавить секреты (переменные окружения)

```bash
supabase secrets set YOOKASSA_SHOP_ID=ваш_shop_id
supabase secrets set YOOKASSA_SECRET_KEY=ваш_secret_key
supabase secrets set APP_URL=https://ваш-домен.com
```

> `APP_URL` — адрес, по которому открывается приложение (без слеша в конце).
> После оплаты ЮKassa вернёт клиента на `APP_URL?payment=success&plan=...`

---

## 5. Настроить вебхук в ЮKassa

В личном кабинете ЮKassa → **Интеграция → Уведомления (HTTP-уведомления)**:

- URL: `https://qzeylogyledmhjpzvgkk.supabase.co/functions/v1/yookassa-webhook`
- События: ✅ `payment.succeeded`

---

## 6. Проверка

1. Откройте приложение, зайдите в **Профиль**
2. Нажмите «Оплатить →» на любом тарифе
3. Вас перенаправит на страницу ЮKassa
4. Оплатите тестовой картой: `4111 1111 1111 1111`, CVV `123`, любой срок
5. После оплаты вернётесь в приложение — подписка активируется автоматически

---

## Тарифная сетка (суммы в ЮKassa)

| Тариф | Цена | Срок |
|-------|------|------|
| month1 | 890 ₽ | 30 дней |
| month3 | 2 220 ₽ | 90 дней |
| month6 | 3 840 ₽ | 180 дней |
| year | 6 240 ₽ | 365 дней |

> Если у клиента ещё есть активная подписка — новый период **добавляется** к текущей дате окончания.

---

## Структура файлов

```
supabase/
  functions/
    create-payment/index.ts   ← создаёт платёж в ЮKassa, возвращает URL
    yookassa-webhook/index.ts ← получает уведомление, активирует подписку
  migrations/
    20260605000000_add_yookassa_payment_id.sql
SETUP_YOOKASSA.md             ← этот файл
```
