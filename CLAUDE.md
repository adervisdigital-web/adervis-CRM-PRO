# Adervis CRM PRO Rules

## Tech Stack
- Frontend: Vanilla JS, CSS (single file index.html).
- Backend: Supabase (Auth, RLS, Edge Functions).
- Payments: ЮKassa API.

## Workflow Rules
1. **Security**: Никогда не выводите API ключи в консоль. Всегда используйте `Deno.env.get` для секретов в функциях.
2. **Refactoring**: Избегайте разрастания index.html. Если функция больше 50 строк, предлагай вынести её в отдельный модуль.
3. **Database**: Все изменения в базе данных (Supabase) должны сопровождаться SQL-миграцией в папку `supabase/migrations/`.
4. **Payments**: При работе с ЮKassa проверяй статусы транзакций через вебхуки.