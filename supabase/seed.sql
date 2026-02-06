-- Optional seed data for New Friends Saloon

-- Default weekly schedule: Mon-Sun 10:00-20:00, lunch break 14:00-15:00, no day off
insert into public.availability_rules (day_of_week, is_day_off, work_start, work_end, break_start, break_end)
values
  (0, false, '10:00', '20:00', '14:00', '15:00'),
  (1, false, '10:00', '20:00', '14:00', '15:00'),
  (2, false, '10:00', '20:00', '14:00', '15:00'),
  (3, false, '10:00', '20:00', '14:00', '15:00'),
  (4, false, '10:00', '20:00', '14:00', '15:00'),
  (5, false, '10:00', '20:00', '14:00', '15:00'),
  (6, false, '10:00', '20:00', '14:00', '15:00')
on conflict (day_of_week) do update
set
  is_day_off = excluded.is_day_off,
  work_start = excluded.work_start,
  work_end = excluded.work_end,
  break_start = excluded.break_start,
  break_end = excluded.break_end;

-- Default services (edit as needed)
insert into public.services (name, price_rupees, duration_minutes, is_active)
values
  ('Haircut', 200, 30, true),
  ('Beard Trim', 100, 15, true),
  ('Haircut + Beard', 280, 45, true),
  ('Head Massage', 150, 15, true)
on conflict do nothing;



