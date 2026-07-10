-- ============================================================
-- Hotfix: redeem_access_code column-ambiguity bug
--
-- Root cause: the function's RETURNS TABLE declares an output parameter
-- named `code_type`, and the UPDATE ... RETURNING clause referenced
-- `code_type` unqualified. plpgsql couldn't tell whether the reference
-- was the access_codes column or the RETURNS TABLE parameter, and
-- raised "column reference `code_type` is ambiguous". The client
-- regex extracted `code_type` from the quoted column name in that
-- error and users saw "We couldn't validate that code (code_type)."
--
-- Fix: alias `access_codes AS ac` throughout and qualify every column
-- reference with `ac.`.
--
-- CREATE OR REPLACE FUNCTION → idempotent, safe to run any number of
-- times. Nothing else in the migration changes.
--
-- Run this in Supabase SQL Editor. No other action needed after it
-- completes.
-- ============================================================

create or replace function public.redeem_access_code(
  p_code    text,
  p_email   text,
  p_user_id uuid
)
returns table (
  access_code_id     uuid,
  code_type          text,
  status             text,
  created_by_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id                 uuid;
  v_type               text;
  v_status             text;
  v_max_uses           int;
  v_used_count         int;
  v_expires_at         timestamptz;
  v_created_by         uuid;
  v_referrer_active    boolean;
begin
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'code_not_found';
  end if;

  select ac.id, ac.code_type, ac.status, ac.max_uses, ac.used_count,
         ac.expires_at, ac.created_by_user_id
    into v_id, v_type, v_status, v_max_uses, v_used_count,
         v_expires_at, v_created_by
    from public.access_codes ac
   where lower(ac.code) = lower(trim(p_code))
   limit 1;

  if v_id is null                                    then raise exception 'code_not_found';       end if;
  if v_status = 'revoked'                            then raise exception 'code_revoked';         end if;
  if v_status = 'used'                               then raise exception 'code_already_used';    end if;
  if v_expires_at is not null and v_expires_at < now() then
    update public.access_codes ac set status = 'expired' where ac.id = v_id;
    raise exception 'code_expired';
  end if;
  if v_used_count >= v_max_uses                      then
    update public.access_codes ac set status = 'used' where ac.id = v_id;
    raise exception 'code_already_used';
  end if;

  if v_type = 'referral' then
    select (p.access_status = 'active')
           and exists (
             select 1 from public.user_emails ue
              where ue.user_id = p.id and ue.is_verified = true
           )
      into v_referrer_active
      from public.profiles p
     where p.id = v_created_by;
    if v_referrer_active is null or not v_referrer_active then
      raise exception 'code_referrer_inactive';
    end if;
  end if;

  update public.access_codes ac
     set used_count = ac.used_count + 1,
         status     = case when ac.used_count + 1 >= ac.max_uses then 'used' else 'active' end
   where ac.id = v_id
   returning ac.code_type, ac.status, ac.created_by_user_id
     into v_type, v_status, v_created_by;

  insert into public.access_code_redemptions (
    access_code_id, redeemed_by_user_id, redeemed_by_email
  ) values (v_id, p_user_id, lower(trim(p_email)));

  return query select v_id, v_type, v_status, v_created_by;
end;
$$;

grant execute on function public.redeem_access_code(text, text, uuid) to anon, authenticated;
