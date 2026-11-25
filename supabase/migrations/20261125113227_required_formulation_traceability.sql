begin;

-- Capture the account label once, including in the initial audit snapshot.
create function private.set_formulation_responsible() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
 select left(coalesce(
   case when jsonb_typeof(u.raw_user_meta_data->'name') = 'string'
        then nullif(regexp_replace(u.raw_user_meta_data->>'name', '^\s+|\s+$', '', 'g'), '') end,
   u.email), 120)
 into strict new.responsible
 from auth.users u where u.id = new.user_id;
 return new;
end;
$$;
revoke all on function private.set_formulation_responsible() from public, anon, authenticated;
create trigger set_formulation_responsible before insert on public.formulation_batches
for each row execute function private.set_formulation_responsible();

-- Existing brand constraints already check totals, date validity, and matching
-- single-brand metadata. A split keeps traceability on each individual brand.
alter table public.formulation_weighings add constraint required_formulation_traceability
 check (case when coalesce(jsonb_array_length(brands), 0) > 1 then
   not jsonb_path_exists(brands, '$[*] ? (@.lot like_regex "^[[:space:]]*$")')
 else coalesce(lot ~ '[^[:space:]]', false) and expiry_date is not null end)
 not valid;

commit;
