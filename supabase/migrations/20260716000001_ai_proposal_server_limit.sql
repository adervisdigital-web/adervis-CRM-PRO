-- Серверный лимит AI-генераций КП.
--
-- Было: лимит пробного тарифа (5 генераций) жил только в state.aiProposalCount —
-- то есть в состоянии самого пользователя (agency_state). Его можно было обнулить
-- или вовсе обойти прямым запросом к Edge Function ai-proposal: функция проверяла
-- только факт авторизации, но не подписку и не лимит. Пользователь с истёкшим
-- триалом мог генерировать КП бесконечно, расходуя общую дневную квоту Gemini.
--
-- Счётчик вынесен в отдельную таблицу, а не колонкой в profiles, намеренно:
-- у роли authenticated есть UPDATE на собственную строку profiles, а колоночный
-- REVOKE в PostgreSQL не перекрывает уже выданный табличный грант — пользователь
-- просто обнулил бы свой счётчик через REST.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_count integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- RLS включён без единой политики — это и есть цель: anon и authenticated не имеют
-- доступа ни на чтение, ни на запись. Читает и пишет только service_role
-- (он минует RLS) из Edge Function ai-proposal.
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ai_usage FROM anon, authenticated;

-- Атомарный инкремент: два параллельных запроса не должны прочитать одно и то же
-- значение и записать одинаковое (та же болезнь, что чинили 03.07 в telegram-webhook).
CREATE OR REPLACE FUNCTION public.increment_ai_proposal_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO ai_usage (user_id, proposal_count, updated_at)
  VALUES (p_user_id, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET proposal_count = ai_usage.proposal_count + 1,
        updated_at     = now()
  RETURNING proposal_count;
$$;

-- Вызывается только из Edge Function ai-proposal под service_role.
REVOKE ALL ON FUNCTION public.increment_ai_proposal_count(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_proposal_count(uuid) TO service_role;
