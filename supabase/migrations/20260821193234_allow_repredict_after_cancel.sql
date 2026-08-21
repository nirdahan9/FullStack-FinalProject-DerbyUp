-- ═══════════════════════════════════════════════════════════════════════════
-- Let a user predict again after cancelling.
--
-- `unique (user_id, question_id)` counted every row, cancelled ones included.
-- Cancelling sets status = 'cancelled' and keeps the row for the record, so a
-- second prediction collided with the first and came back as "already
-- predicted" — leaving the user stuck with no way out.
--
-- A partial unique index instead: at most one live prediction per question,
-- with any number of cancelled rows behind it. The audit trail survives and
-- the cancel button does what it says.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.predictions
  drop constraint if exists predictions_user_id_question_id_key;

create unique index if not exists predictions_one_live_per_question
  on public.predictions (user_id, question_id)
  where status <> 'cancelled';
