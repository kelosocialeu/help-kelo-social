-- Centre d’aide Kelo Social : Supabase
-- À coller dans Supabase > SQL Editor.
-- IMPORTANT : remplace uniquement le mot de passe entre les quotes avant d’exécuter.

create extension if not exists pgcrypto;

create table if not exists public.help_admin_credentials (
  id bigint primary key generated always as identity,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.help_knowledge (
  id bigint primary key generated always as identity,
  title text not null,
  category text not null default 'Général',
  content text not null,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_contacts (
  id bigint primary key generated always as identity,
  name text not null,
  email text not null,
  subject text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.help_admin_credentials enable row level security;
alter table public.help_knowledge enable row level security;
alter table public.help_contacts enable row level security;

revoke all on table public.help_admin_credentials from anon, authenticated;
revoke all on table public.help_knowledge from anon, authenticated;
revoke all on table public.help_contacts from anon, authenticated;
grant all on table public.help_admin_credentials to service_role;
grant all on table public.help_knowledge to service_role;
grant all on table public.help_contacts to service_role;

create or replace function public.verify_help_admin_password(candidate text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare stored_hash text;
begin
  if candidate is null or length(candidate) < 1 then return false; end if;
  select password_hash into stored_hash
  from public.help_admin_credentials
  order by id desc limit 1;
  if stored_hash is null then return false; end if;
  return crypt(candidate, stored_hash) = stored_hash;
end;
$$;

revoke execute on function public.verify_help_admin_password(text) from public;
revoke execute on function public.verify_help_admin_password(text) from anon;
revoke execute on function public.verify_help_admin_password(text) from authenticated;
grant execute on function public.verify_help_admin_password(text) to service_role;

delete from public.help_admin_credentials;
insert into public.help_admin_credentials(password_hash)
values (crypt('REMPLACE_PAR_TON_MOT_DE_PASSE_ADMIN', gen_salt('bf', 12)));

insert into public.help_knowledge(title,category,content,published)
select 'Bienvenue dans Kelo Social','Général','Kelo Social est un réseau social basé sur AT Protocol. Le centre d’aide explique le compte, les publications, les paramètres, la sécurité, la certification, la vérification et le fonctionnement du protocole.',true
where not exists (select 1 from public.help_knowledge);

-- Vérification facultative après exécution :
select id, created_at from public.help_admin_credentials;
select count(*) as knowledge_count from public.help_knowledge;
select count(*) as contact_count from public.help_contacts;