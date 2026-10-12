-- Connector tokens get no direct database rights (docs/REMOTE_MCP_PLAN.md, key decision 4).
--
-- A chat client that signs in through the Supabase Auth OAuth server receives a real Supabase JWT,
-- and the anon key is public, so without this the client could call PostgREST and Storage with
-- the user's full row-level rights, capability-slug RPCs included. The Custom Access Token hook
-- below gives every token that carries `client_id` (only OAuth clients' tokens do) the role
-- `noacg_connector`. That role holds no privileges, and no API role is a member of it: PostgREST
-- and Storage switch to the token's role with SET ROLE, which `authenticator` is refused, so every
-- request with such a token fails before it reads anything, whatever PUBLIC can execute. First-
-- party sessions (no `client_id`) pass through unchanged.
--
-- Wired in config.toml under [auth.hook.custom_access_token]. On a hosted project the hook stays
-- off until the owner enables it; until then this file only adds an unused role and function.
-- Additive: nothing is dropped, revoked from an existing object, or rewritten. Revert: disable the
-- hook, then drop the function and the role.
set lock_timeout = '2s';
set statement_timeout = '30s';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'noacg_connector') then
    create role noacg_connector nologin noinherit;
  end if;
end;
$$;

-- GoTrue calls this as supabase_auth_admin with {user_id, claims, authentication_method} and signs
-- whatever `claims` comes back. Not a definer: it reads nothing but its argument.
create or replace function public.connector_access_token(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb := event -> 'claims';
begin
  if nullif(claims ->> 'client_id', '') is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb('noacg_connector'::text));
  end if;
  return jsonb_build_object('claims', claims);
end;
$$;

grant execute on function public.connector_access_token(jsonb) to supabase_auth_admin;
revoke execute on function public.connector_access_token(jsonb) from public, anon, authenticated;

-- Self-check: CALL the hook for both kinds of token, and prove the role is closed.
do $$
declare
  first_party jsonb := '{"claims": {"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "aud": "authenticated"}}';
  connector jsonb := '{"claims": {"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated", "aud": "authenticated", "client_id": "00000000-0000-0000-0000-0000000000c1"}}';
  issued jsonb := public.connector_access_token(connector) -> 'claims';
  members text;
begin
  -- IS DISTINCT FROM, never <>: a key the hook dropped compares as NULL and would pass.
  if public.connector_access_token(first_party) -> 'claims' is distinct from first_party -> 'claims' then
    raise exception '0089: a first-party token''s claims must pass through unchanged';
  end if;
  if issued ->> 'role' is distinct from 'noacg_connector'
     or issued ->> 'client_id' is distinct from '00000000-0000-0000-0000-0000000000c1'
     or issued ->> 'sub' is distinct from '00000000-0000-0000-0000-000000000001' then
    raise exception '0089: a connector token must get role noacg_connector and keep client_id and sub';
  end if;
  select string_agg(rolname, ', ') into members from pg_roles
   where rolname in ('authenticator', 'anon', 'authenticated', 'service_role', 'supabase_storage_admin')
     and pg_has_role(rolname, 'noacg_connector', 'member');
  if members is not null then
    raise exception '0089: % must not be able to assume noacg_connector', members;
  end if;
  -- Read the ACLs themselves: information_schema hides grants the migrating role cannot see.
  if exists (select 1 from pg_class c, aclexplode(c.relacl) a where a.grantee = 'noacg_connector'::regrole)
     or exists (select 1 from pg_proc p, aclexplode(p.proacl) a where a.grantee = 'noacg_connector'::regrole)
     or exists (select 1 from pg_namespace n, aclexplode(n.nspacl) a where a.grantee = 'noacg_connector'::regrole) then
    raise exception '0089: noacg_connector must hold no privileges';
  end if;
  if not has_function_privilege('supabase_auth_admin', 'public.connector_access_token(jsonb)', 'execute')
     or has_function_privilege('anon', 'public.connector_access_token(jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.connector_access_token(jsonb)', 'execute') then
    raise exception '0089: only supabase_auth_admin may execute connector_access_token';
  end if;
end;
$$;
