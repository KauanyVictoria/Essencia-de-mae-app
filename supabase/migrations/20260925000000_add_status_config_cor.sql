-- Migration opcional e aditiva para projetos cuja status_config ainda não possui cor.
-- Execute manualmente no SQL Editor do Supabase; este arquivo não é aplicado pelo app.
alter table public.status_config
  add column if not exists cor text default '#87977f';

comment on column public.status_config.cor is
  'Cor hexadecimal escolhida pelo usuário para representar o status no fluxo de conteúdo.';
