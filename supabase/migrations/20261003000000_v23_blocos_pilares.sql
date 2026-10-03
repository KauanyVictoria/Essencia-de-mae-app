-- V2.3: taxonomias personalizadas por usuário e operações atômicas de renomeação/exclusão.
-- Esta migration é aditiva. Os campos textuais legados continuam sendo preenchidos.
create extension if not exists pgcrypto;

create table if not exists public.blocos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.pilares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.blocos add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.blocos add column if not exists nome text;
alter table public.blocos add column if not exists ordem integer not null default 0;
alter table public.pilares add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.pilares add column if not exists nome text;
alter table public.pilares add column if not exists ordem integer not null default 0;
alter table public.conteudos add column if not exists bloco_id uuid references public.blocos(id) on delete restrict;
alter table public.conteudos add column if not exists pilar_id uuid references public.pilares(id) on delete restrict;

create unique index if not exists blocos_user_nome_unique on public.blocos(user_id, lower(trim(nome)));
create unique index if not exists pilares_user_nome_unique on public.pilares(user_id, lower(trim(nome)));
create index if not exists conteudos_bloco_id_idx on public.conteudos(bloco_id);
create index if not exists conteudos_pilar_id_idx on public.conteudos(pilar_id);

alter table public.blocos enable row level security;
alter table public.pilares enable row level security;
drop policy if exists "blocos_do_usuario" on public.blocos;
create policy "blocos_do_usuario" on public.blocos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "pilares_do_usuario" on public.pilares;
create policy "pilares_do_usuario" on public.pilares for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.manage_content_block(operation text, source_id uuid, target_id uuid default null, new_name text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare source_name text; destination_name text; associated bigint;
begin
  select nome into source_name from public.blocos where id=source_id and user_id=auth.uid();
  if source_name is null then raise exception 'Bloco não encontrado ou sem permissão'; end if;
  if operation='rename' then
    if length(trim(new_name))=0 then raise exception 'Informe um nome'; end if;
    update public.conteudos set bloco=trim(new_name) where user_id=auth.uid() and (bloco_id=source_id or (bloco_id is null and bloco=source_name));
    update public.blocos set nome=trim(new_name) where id=source_id and user_id=auth.uid();
  elsif operation='delete' then
    select count(*) into associated from public.conteudos where user_id=auth.uid() and (bloco_id=source_id or (bloco_id is null and bloco=source_name));
    if associated>0 then
      select nome into destination_name from public.blocos where id=target_id and user_id=auth.uid() and id<>source_id;
      if destination_name is null then raise exception 'Escolha outro bloco para mover os conteúdos associados'; end if;
      update public.conteudos set bloco_id=target_id, bloco=destination_name where user_id=auth.uid() and (bloco_id=source_id or (bloco_id is null and bloco=source_name));
    end if;
    delete from public.blocos where id=source_id and user_id=auth.uid();
  else raise exception 'Operação inválida'; end if;
end $$;

create or replace function public.manage_content_pillar(operation text, source_id uuid, target_id uuid default null, new_name text default null)
returns void language plpgsql security invoker set search_path = public as $$
declare source_name text; destination_name text; associated bigint;
begin
  select nome into source_name from public.pilares where id=source_id and user_id=auth.uid();
  if source_name is null then raise exception 'Pilar não encontrado ou sem permissão'; end if;
  if operation='rename' then
    if length(trim(new_name))=0 then raise exception 'Informe um nome'; end if;
    update public.conteudos set pilar=trim(new_name) where user_id=auth.uid() and (pilar_id=source_id or (pilar_id is null and pilar=source_name));
    update public.pilares set nome=trim(new_name) where id=source_id and user_id=auth.uid();
  elsif operation='delete' then
    select count(*) into associated from public.conteudos where user_id=auth.uid() and (pilar_id=source_id or (pilar_id is null and pilar=source_name));
    if associated>0 then
      select nome into destination_name from public.pilares where id=target_id and user_id=auth.uid() and id<>source_id;
      if destination_name is null then raise exception 'Escolha outro pilar para mover os conteúdos associados'; end if;
      update public.conteudos set pilar_id=target_id, pilar=destination_name where user_id=auth.uid() and (pilar_id=source_id or (pilar_id is null and pilar=source_name));
    end if;
    delete from public.pilares where id=source_id and user_id=auth.uid();
  else raise exception 'Operação inválida'; end if;
end $$;

revoke all on function public.manage_content_block(text,uuid,uuid,text) from public;
revoke all on function public.manage_content_pillar(text,uuid,uuid,text) from public;
grant execute on function public.manage_content_block(text,uuid,uuid,text) to authenticated;
grant execute on function public.manage_content_pillar(text,uuid,uuid,text) to authenticated;

grant select, insert, update, delete on public.blocos to authenticated;
grant select, insert, update, delete on public.pilares to authenticated;
