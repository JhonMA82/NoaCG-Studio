-- NoaCG Pro traffic on the shared gateway gets its own ledger discriminator, so gateway
-- accounting can tell Pro generations (image concepts, design interpretation) from the
-- general BYO harness without a schema change beyond this CHECK widening.
-- Additive only: every existing row already satisfies the new constraint.

alter table public.ai_gateway_requests
  drop constraint if exists ai_gateway_requests_task_check;

alter table public.ai_gateway_requests
  add constraint ai_gateway_requests_task_check
  check (task in ('byo-generate', 'pro-generate'));
