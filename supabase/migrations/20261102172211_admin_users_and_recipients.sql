begin;

create table public.notification_recipients (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check (email=lower(trim(email)) and length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
alter table public.notification_recipients enable row level security;
revoke all on public.notification_recipients from public,anon,authenticated;
grant select,insert,update,delete on public.notification_recipients to authenticated,service_role;
create policy notification_recipients_admin on public.notification_recipients
 for all to authenticated
 using ((select public.current_user_role())='admin')
 with check ((select public.current_user_role())='admin');

-- Auth administration runs in the Edge Function; only that server can change roles.
-- Serializing role writes prevents concurrent admins from removing the last admin.
create function public.admin_set_user_role(p_actor uuid,p_user uuid,p_role text)
returns void language plpgsql security invoker set search_path='' as $$
declare old_role text;
begin
 perform pg_catalog.pg_advisory_xact_lock(196704,1);
 if not exists(select 1 from public.user_roles where user_id=p_actor and role='admin') then
  raise exception 'Administrator access required';
 end if;
 if p_actor=p_user then raise exception 'Cannot change own access';end if;
 if p_role is not null and p_role not in ('bakery','warehouse','admin') then raise exception 'Invalid role';end if;
 if p_role is not null and not exists(select 1 from auth.users where id=p_user and deleted_at is null) then raise exception 'User unavailable';end if;
 select role into old_role from public.user_roles where user_id=p_user;
 if old_role='admin' and p_role is distinct from 'admin' and (select count(*) from public.user_roles where role='admin')<=1 then
  raise exception 'At least one administrator required';
 end if;
 if p_role is null then delete from public.user_roles where user_id=p_user;
 else insert into public.user_roles(user_id,role) values(p_user,p_role)
  on conflict(user_id) do update set role=excluded.role;
 end if;
end;
$$;
revoke all on function public.admin_set_user_role(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_set_user_role(uuid,uuid,text) to service_role;
grant select,insert,update,delete on public.user_roles to service_role;
grant usage on schema auth to service_role;
grant select(id,deleted_at) on auth.users to service_role;

-- Soft deletion preserves pedido foreign keys. Remove any role even if a concurrent
-- administration request changed it between revocation and Auth deletion.
create function private.revoke_deleted_user_role()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from public.user_roles where user_id=new.id;
 return new;
end;
$$;
revoke all on function private.revoke_deleted_user_role() from public,anon,authenticated;
create trigger revoke_deleted_user_role after update of deleted_at on auth.users
 for each row when (new.deleted_at is not null)
 execute function private.revoke_deleted_user_role();

commit;
