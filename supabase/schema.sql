-- New Friends Saloon booking system (single-barber) - schema + RLS + RPCs
-- Run in Supabase SQL editor.

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$ begin
  create type public.booking_status as enum (
    'BOOKED',
    'CHECKED_IN',
    'IN_SERVICE',
    'COMPLETED',
    'CANCELLED',
    'EXPIRED',
    'NO_SHOW',
    'HOLD'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type public.waitlist_status as enum (
    'WAITING',
    'PROMOTED',
    'CONFIRMED',
    'CANCELLED',
    'EXPIRED'
  );
exception
  when duplicate_object then null;
end $$;

-- If enums already existed, ensure required labels exist (idempotent migrations)
do $$ begin
  alter type public.booking_status add value if not exists 'HOLD';
  alter type public.booking_status add value if not exists 'NO_SHOW';
exception
  when undefined_object then null;
end $$;

do $$ begin
  alter type public.waitlist_status add value if not exists 'PROMOTED';
  alter type public.waitlist_status add value if not exists 'CONFIRMED';
exception
  when undefined_object then null;
end $$;

-- Helpers
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Barber access allowlist (only these emails can use barber dashboard).
-- Manage entries from Supabase SQL editor, e.g.:
--   insert into public.barber_allowlist(email) values ('a@b.com'), ('c@d.com') on conflict do nothing;
create table if not exists public.barber_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

-- Lock down direct access from the public API (manage via SQL editor / service role).
revoke all on table public.barber_allowlist from public;
revoke all on table public.barber_allowlist from anon, authenticated;

create or replace function public.is_barber()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.role() = 'authenticated'
     and exists (
       select 1
       from public.barber_allowlist a
       where lower(a.email) = lower(auth.jwt() ->> 'email')
     );
$$;

revoke all on function public.is_barber() from public;
grant execute on function public.is_barber() to anon, authenticated;

-- Tables
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_rupees integer not null check (price_rupees >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
before update on public.services
for each row execute function public.tg_set_updated_at();

-- One row per day (0=Sun ... 6=Sat)
create table if not exists public.availability_rules (
  day_of_week smallint primary key check (day_of_week between 0 and 6),
  is_day_off boolean not null default false,
  work_start time not null default '10:00',
  work_end time not null default '20:00',
  break_start time null,
  break_end time null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (work_start < work_end),
  check (
    (break_start is null and break_end is null)
    or (break_start is not null and break_end is not null and break_start < break_end)
  )
);

drop trigger if exists trg_availability_rules_updated_at on public.availability_rules;
create trigger trg_availability_rules_updated_at
before update on public.availability_rules
for each row execute function public.tg_set_updated_at();

create table if not exists public.blocked_slots (
  id uuid primary key default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

drop trigger if exists trg_blocked_slots_updated_at on public.blocked_slots;
create trigger trg_blocked_slots_updated_at
before update on public.blocked_slots
for each row execute function public.tg_set_updated_at();

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  customer_phone text not null,
  customer_token uuid not null default gen_random_uuid(),
  start_time timestamptz not null,
  end_time timestamptz not null,
  status public.booking_status not null default 'BOOKED',
  grace_expiry_time timestamptz not null,
  hold_expires_at timestamptz null,
  checked_in_at timestamptz null,
  service_started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

create unique index if not exists bookings_customer_token_uq on public.bookings(customer_token);
create index if not exists bookings_start_time_idx on public.bookings(start_time);
create index if not exists bookings_status_idx on public.bookings(status);

drop trigger if exists trg_bookings_updated_at on public.bookings;
create trigger trg_bookings_updated_at
before update on public.bookings
for each row execute function public.tg_set_updated_at();

create table if not exists public.booking_services (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  service_id uuid not null references public.services(id),
  service_name text not null,
  price_rupees integer not null check (price_rupees >= 0),
  duration_minutes integer not null check (duration_minutes > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  primary key (booking_id, service_id)
);

create index if not exists booking_services_booking_id_idx on public.booking_services(booking_id);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  slot_start_time timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  customer_token uuid not null default gen_random_uuid(),
  service_ids uuid[] not null,
  total_duration_minutes integer not null check (total_duration_minutes > 0),
  total_price_rupees integer not null check (total_price_rupees >= 0),
  status public.waitlist_status not null default 'WAITING',
  promoted_at timestamptz null,
  promotion_expires_at timestamptz null,
  booking_id uuid null references public.bookings(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists waitlist_customer_token_uq on public.waitlist(customer_token);
create index if not exists waitlist_slot_start_time_idx on public.waitlist(slot_start_time);
create index if not exists waitlist_status_idx on public.waitlist(status);
create unique index if not exists waitlist_no_duplicate_active
  on public.waitlist(slot_start_time, customer_phone)
  where status in ('WAITING','PROMOTED');

drop trigger if exists trg_waitlist_updated_at on public.waitlist;
create trigger trg_waitlist_updated_at
before update on public.waitlist
for each row execute function public.tg_set_updated_at();

-- Booking transition guardrails
create or replace function public.tg_enforce_booking_transitions()
returns trigger
language plpgsql
as $$
declare
  now_ts timestamptz := now();
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- Prevent nonsense time edits after creation
  if (old.start_time <> new.start_time) or (old.end_time <> new.end_time) then
    raise exception 'Booking times cannot be modified';
  end if;

  -- Status transition rules
  if old.status = new.status then
    return new;
  end if;

  -- HOLD can only become BOOKED (confirm) or CANCELLED/EXPIRED (timeout)
  if old.status = 'HOLD' then
    if new.status not in ('BOOKED','CANCELLED','EXPIRED') then
      raise exception 'Invalid transition from HOLD to %', new.status;
    end if;
    return new;
  end if;

  if new.status = 'CHECKED_IN' then
    if old.status <> 'BOOKED' then
      raise exception 'Can only check in from BOOKED';
    end if;
    if now_ts < (old.start_time - interval '5 minutes') or now_ts > (old.start_time + interval '5 minutes') then
      raise exception 'Check-in is only allowed within the check-in window';
    end if;
    if now_ts > old.grace_expiry_time then
      raise exception 'Booking already past grace period';
    end if;
    new.checked_in_at = now_ts;
    return new;
  end if;

  if new.status = 'IN_SERVICE' then
    if old.status <> 'CHECKED_IN' then
      raise exception 'Service cannot start unless customer is checked in';
    end if;
    new.service_started_at = now_ts;
    return new;
  end if;

  if new.status = 'COMPLETED' then
    if old.status <> 'IN_SERVICE' then
      raise exception 'Can only complete from IN_SERVICE';
    end if;
    new.completed_at = now_ts;
    return new;
  end if;

  if new.status in ('CANCELLED','EXPIRED','NO_SHOW') then
    -- Allow barber to mark no-show/expired/cancelled from BOOKED
    if old.status not in ('BOOKED','HOLD') then
      raise exception 'Can only mark CANCELLED/EXPIRED/NO_SHOW from BOOKED/HOLD';
    end if;
    return new;
  end if;

  raise exception 'Unsupported booking transition % -> %', old.status, new.status;
end;
$$;

drop trigger if exists trg_enforce_booking_transitions on public.bookings;
create trigger trg_enforce_booking_transitions
before update on public.bookings
for each row execute function public.tg_enforce_booking_transitions();

-- RLS
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_slots enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_services enable row level security;
alter table public.waitlist enable row level security;

-- Services: public read active; barber CRUD
drop policy if exists "services_public_read_active" on public.services;
create policy "services_public_read_active"
on public.services for select
to anon, authenticated
using (is_active = true or public.is_barber());

drop policy if exists "services_barber_write" on public.services;
create policy "services_barber_write"
on public.services for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

-- Availability: public read; barber write
drop policy if exists "availability_public_read" on public.availability_rules;
create policy "availability_public_read"
on public.availability_rules for select
to anon, authenticated
using (true);

drop policy if exists "availability_barber_write" on public.availability_rules;
create policy "availability_barber_write"
on public.availability_rules for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

drop policy if exists "blocked_public_read" on public.blocked_slots;
create policy "blocked_public_read"
on public.blocked_slots for select
to anon, authenticated
using (true);

drop policy if exists "blocked_barber_write" on public.blocked_slots;
create policy "blocked_barber_write"
on public.blocked_slots for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

-- Bookings & waitlist: barber-only direct access
drop policy if exists "bookings_barber_all" on public.bookings;
create policy "bookings_barber_all"
on public.bookings for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

drop policy if exists "booking_services_barber_all" on public.booking_services;
create policy "booking_services_barber_all"
on public.booking_services for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

drop policy if exists "waitlist_barber_all" on public.waitlist;
create policy "waitlist_barber_all"
on public.waitlist for all
to authenticated
using (public.is_barber())
with check (public.is_barber());

-- =========
-- RPCs (customer safe, token based)
-- =========

create or replace function public._calc_services_totals(p_service_ids uuid[])
returns table(total_duration_minutes integer, total_price_rupees integer)
language sql
stable
as $$
  select
    coalesce(sum(duration_minutes), 0)::int as total_duration_minutes,
    coalesce(sum(price_rupees), 0)::int as total_price_rupees
  from public.services
  where id = any(p_service_ids) and is_active = true;
$$;

create or replace function public.maintenance_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
begin
  -- Expire un-checked-in bookings past grace
  update public.bookings
  set status = 'EXPIRED'
  where status = 'BOOKED'
    and now_ts > grace_expiry_time;

  -- Expire promotions that were not confirmed
  update public.waitlist
  set status = 'EXPIRED'
  where status = 'PROMOTED'
    and promotion_expires_at is not null
    and now_ts > promotion_expires_at;

  -- Cancel HOLD bookings that timed out
  update public.bookings
  set status = 'CANCELLED'
  where status = 'HOLD'
    and hold_expires_at is not null
    and now_ts > hold_expires_at;
end;
$$;

revoke all on function public.maintenance_tick() from public;
grant execute on function public.maintenance_tick() to anon, authenticated;

create or replace function public.create_booking(
  p_customer_name text,
  p_customer_phone text,
  p_start_time timestamptz,
  p_service_ids uuid[]
)
returns table(booking_id uuid, customer_token uuid, end_time timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  totals record;
  v_end timestamptz;
  v_booking_id uuid;
  v_token uuid;
begin
  perform public.maintenance_tick();
  if p_start_time < now() then
    raise exception 'Cannot book a slot in the past';
  end if;
  if p_start_time > (now() + interval '7 days') then
    raise exception 'Cannot book more than 7 days in advance';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) < 8 then
    raise exception 'Customer phone is required';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null or array_length(p_service_ids, 1) = 0 then
    raise exception 'Select at least one service';
  end if;

  select * into totals from public._calc_services_totals(p_service_ids);
  if totals.total_duration_minutes <= 0 then
    raise exception 'Invalid services selection';
  end if;

  v_end := p_start_time + make_interval(mins => totals.total_duration_minutes);

  -- Prevent overlap (buffer=5m)
  if exists (
    select 1
    from public.bookings b
    where b.status in ('BOOKED','CHECKED_IN','IN_SERVICE','HOLD')
      and tstzrange(b.start_time, b.end_time + interval '5 minutes', '[)') &&
          tstzrange(p_start_time, v_end + interval '5 minutes', '[)')
  ) then
    raise exception 'Slot is not available';
  end if;

  v_token := gen_random_uuid();

  insert into public.bookings (
    customer_name,
    customer_phone,
    customer_token,
    start_time,
    end_time,
    status,
    grace_expiry_time
  )
  values (
    trim(p_customer_name),
    trim(p_customer_phone),
    v_token,
    p_start_time,
    v_end,
    'BOOKED',
    p_start_time + interval '5 minutes'
  )
  returning id into v_booking_id;

  insert into public.booking_services (booking_id, service_id, service_name, price_rupees, duration_minutes, sort_order)
  select
    v_booking_id,
    s.id,
    s.name,
    s.price_rupees,
    s.duration_minutes,
    row_number() over (order by s.name)::smallint - 1
  from public.services s
  where s.id = any(p_service_ids) and s.is_active = true;

  booking_id := v_booking_id;
  customer_token := v_token;
  end_time := v_end;
  return next;
end;
$$;

revoke all on function public.create_booking(text,text,timestamptz,uuid[]) from public;
grant execute on function public.create_booking(text,text,timestamptz,uuid[]) to anon, authenticated;

create or replace function public.get_booking_for_customer(
  p_booking_id uuid,
  p_customer_token uuid
)
returns table(
  booking_id uuid,
  customer_name text,
  customer_phone text,
  start_time timestamptz,
  end_time timestamptz,
  status public.booking_status,
  grace_expiry_time timestamptz,
  services jsonb,
  total_duration_minutes integer,
  total_price_rupees integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.maintenance_tick();

  return query
  with b as (
    select *
    from public.bookings
    where id = p_booking_id
      and customer_token = p_customer_token
    limit 1
  ),
  svc as (
    select
      bs.booking_id,
      jsonb_agg(
        jsonb_build_object(
          'service_id', bs.service_id,
          'name', bs.service_name,
          'price_rupees', bs.price_rupees,
          'duration_minutes', bs.duration_minutes
        )
        order by bs.sort_order
      ) as services,
      sum(bs.duration_minutes)::int as total_duration_minutes,
      sum(bs.price_rupees)::int as total_price_rupees
    from public.booking_services bs
    join b on b.id = bs.booking_id
    group by bs.booking_id
  )
  select
    b.id,
    b.customer_name,
    b.customer_phone,
    b.start_time,
    b.end_time,
    b.status,
    b.grace_expiry_time,
    coalesce(svc.services, '[]'::jsonb),
    coalesce(svc.total_duration_minutes, 0),
    coalesce(svc.total_price_rupees, 0)
  from b
  left join svc on svc.booking_id = b.id;
end;
$$;

revoke all on function public.get_booking_for_customer(uuid,uuid) from public;
grant execute on function public.get_booking_for_customer(uuid,uuid) to anon, authenticated;

create or replace function public.customer_check_in(
  p_booking_id uuid,
  p_customer_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings%rowtype;
  now_ts timestamptz := now();
begin
  perform public.maintenance_tick();

  select * into b
  from public.bookings
  where id = p_booking_id
    and customer_token = p_customer_token
  limit 1;

  if not found then
    raise exception 'Booking not found';
  end if;

  if b.status <> 'BOOKED' then
    raise exception 'Booking is not eligible for check-in';
  end if;

  if now_ts < (b.start_time - interval '5 minutes') or now_ts > (b.start_time + interval '5 minutes') then
    raise exception 'Not in check-in window';
  end if;

  if now_ts > b.grace_expiry_time then
    raise exception 'Past grace period';
  end if;

  update public.bookings
  set status = 'CHECKED_IN',
      checked_in_at = now_ts
  where id = b.id;
end;
$$;

revoke all on function public.customer_check_in(uuid,uuid) from public;
grant execute on function public.customer_check_in(uuid,uuid) to anon, authenticated;

create or replace function public.join_waitlist(
  p_slot_start_time timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_service_ids uuid[]
)
returns table(waitlist_id uuid, customer_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  totals record;
  v_count int;
  v_id uuid;
  v_token uuid;
begin
  perform public.maintenance_tick();
  if p_slot_start_time < now() then
    raise exception 'Cannot join a waitlist for a past slot';
  end if;
  if p_slot_start_time > (now() + interval '7 days') then
    raise exception 'Cannot join a waitlist more than 7 days in advance';
  end if;

  if p_customer_name is null or length(trim(p_customer_name)) = 0 then
    raise exception 'Customer name is required';
  end if;

  if p_customer_phone is null or length(trim(p_customer_phone)) < 8 then
    raise exception 'Customer phone is required';
  end if;

  if p_service_ids is null or array_length(p_service_ids, 1) is null or array_length(p_service_ids, 1) = 0 then
    raise exception 'Select at least one service';
  end if;

  select * into totals from public._calc_services_totals(p_service_ids);
  if totals.total_duration_minutes <= 0 then
    raise exception 'Invalid services selection';
  end if;

  select count(*) into v_count
  from public.waitlist
  where slot_start_time = p_slot_start_time
    and status = 'WAITING';

  if v_count >= 3 then
    raise exception 'Waitlist is full for this slot';
  end if;

  v_token := gen_random_uuid();

  insert into public.waitlist (
    slot_start_time,
    customer_name,
    customer_phone,
    customer_token,
    service_ids,
    total_duration_minutes,
    total_price_rupees,
    status
  )
  values (
    p_slot_start_time,
    trim(p_customer_name),
    trim(p_customer_phone),
    v_token,
    p_service_ids,
    totals.total_duration_minutes,
    totals.total_price_rupees,
    'WAITING'
  )
  returning id into v_id;

  waitlist_id := v_id;
  customer_token := v_token;
  return next;
end;
$$;

revoke all on function public.join_waitlist(timestamptz,text,text,uuid[]) from public;
grant execute on function public.join_waitlist(timestamptz,text,text,uuid[]) to anon, authenticated;

create or replace function public.get_waitlist_for_customer(
  p_waitlist_id uuid,
  p_customer_token uuid
)
returns table(
  waitlist_id uuid,
  slot_start_time timestamptz,
  status public.waitlist_status,
  promoted_at timestamptz,
  promotion_expires_at timestamptz,
  booking_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.maintenance_tick();

  return query
  select
    w.id,
    w.slot_start_time,
    w.status,
    w.promoted_at,
    w.promotion_expires_at,
    w.booking_id
  from public.waitlist w
  where w.id = p_waitlist_id
    and w.customer_token = p_customer_token
  limit 1;
end;
$$;

revoke all on function public.get_waitlist_for_customer(uuid,uuid) from public;
grant execute on function public.get_waitlist_for_customer(uuid,uuid) to anon, authenticated;

create or replace function public.get_busy_intervals(
  p_start timestamptz,
  p_end timestamptz
)
returns table(start_time timestamptz, end_time timestamptz)
language sql
security definer
set search_path = public
as $$
  select b.start_time, b.end_time
  from public.bookings b
  where b.status in ('BOOKED','CHECKED_IN','IN_SERVICE','HOLD')
    and b.start_time < p_end
    and b.end_time > p_start;
$$;

revoke all on function public.get_busy_intervals(timestamptz,timestamptz) from public;
grant execute on function public.get_busy_intervals(timestamptz,timestamptz) to anon, authenticated;

create or replace function public.promote_waitlist_for_slot(p_slot_start_time timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.waitlist%rowtype;
  v_end timestamptz;
  v_booking_id uuid;
  now_ts timestamptz := now();
begin
  perform public.maintenance_tick();

  -- If someone is already promoted and not expired, do nothing.
  if exists (
    select 1 from public.waitlist
    where slot_start_time = p_slot_start_time
      and status = 'PROMOTED'
      and promotion_expires_at is not null
      and now_ts <= promotion_expires_at
  ) then
    return;
  end if;

  select *
  into w
  from public.waitlist
  where slot_start_time = p_slot_start_time
    and status = 'WAITING'
  order by created_at asc
  limit 1;

  if not found then
    return;
  end if;

  v_end := p_slot_start_time + make_interval(mins => w.total_duration_minutes);

  -- Only promote if the slot is truly free now (buffer=5m)
  if exists (
    select 1
    from public.bookings b
    where b.status in ('BOOKED','CHECKED_IN','IN_SERVICE','HOLD')
      and tstzrange(b.start_time, b.end_time + interval '5 minutes', '[)') &&
          tstzrange(p_slot_start_time, v_end + interval '5 minutes', '[)')
  ) then
    return;
  end if;

  insert into public.bookings (
    customer_name,
    customer_phone,
    customer_token,
    start_time,
    end_time,
    status,
    grace_expiry_time,
    hold_expires_at
  )
  values (
    w.customer_name,
    w.customer_phone,
    w.customer_token,
    p_slot_start_time,
    v_end,
    'HOLD',
    p_slot_start_time + interval '5 minutes',
    now_ts + interval '5 minutes'
  )
  returning id into v_booking_id;

  insert into public.booking_services (booking_id, service_id, service_name, price_rupees, duration_minutes, sort_order)
  select
    v_booking_id,
    s.id,
    s.name,
    s.price_rupees,
    s.duration_minutes,
    row_number() over (order by s.name)::smallint - 1
  from public.services s
  where s.id = any(w.service_ids) and s.is_active = true;

  update public.waitlist
  set status = 'PROMOTED',
      promoted_at = now_ts,
      promotion_expires_at = now_ts + interval '5 minutes',
      booking_id = v_booking_id
  where id = w.id;
end;
$$;

revoke all on function public.promote_waitlist_for_slot(timestamptz) from public;
grant execute on function public.promote_waitlist_for_slot(timestamptz) to anon, authenticated;

create or replace function public.confirm_promotion(
  p_waitlist_id uuid,
  p_customer_token uuid
)
returns table(booking_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.waitlist%rowtype;
  now_ts timestamptz := now();
begin
  perform public.maintenance_tick();

  select * into w
  from public.waitlist
  where id = p_waitlist_id
    and customer_token = p_customer_token
  limit 1;

  if not found then
    raise exception 'Waitlist entry not found';
  end if;

  if w.status <> 'PROMOTED' then
    raise exception 'Not eligible to confirm';
  end if;

  if w.promotion_expires_at is null or now_ts > w.promotion_expires_at then
    raise exception 'Promotion expired';
  end if;

  if w.booking_id is null then
    raise exception 'No booking associated';
  end if;

  update public.bookings
  set status = 'BOOKED',
      hold_expires_at = null,
      grace_expiry_time = start_time + interval '5 minutes'
  where id = w.booking_id
    and status = 'HOLD';

  update public.waitlist
  set status = 'CONFIRMED'
  where id = w.id;

  booking_id := w.booking_id;
  return next;
end;
$$;

revoke all on function public.confirm_promotion(uuid,uuid) from public;
grant execute on function public.confirm_promotion(uuid,uuid) to anon, authenticated;


