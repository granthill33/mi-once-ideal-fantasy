-- Once ideal por jornada. No activa RLS en players: el draft sigue igual.
-- photo_path solo lo pueden cambiar los editores del once (o el rol de migración).

alter table public.players
  add column if not exists photo_path text;

create table public.ideal_editors (
  manager_id bigint primary key references public.managers (id) on delete cascade
);

insert into public.ideal_editors (manager_id) values (13), (19);

create or replace function public.protect_player_photo_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() in ('anon', 'authenticated') then
    if (tg_op = 'INSERT' and new.photo_path is not null)
       or (tg_op = 'UPDATE' and new.photo_path is distinct from old.photo_path) then
      if not exists (
        select 1
        from public.ideal_editors e
        where e.manager_id = public.current_manager_id()
      ) then
        raise exception 'no autorizado a cambiar la foto';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_player_photo_path on public.players;
create trigger protect_player_photo_path
  before insert or update on public.players
  for each row
  execute function public.protect_player_photo_path();

create table public.ideal_matchdays (
  number integer primary key check (number between 1 and 50),
  formation text not null check (formation in ('4-4-2', '4-3-3', '3-5-2', '5-3-2', '4-5-1')),
  bench_count integer not null default 7 check (bench_count between 0 and 12),
  updated_at timestamptz not null default now()
);

create table public.ideal_lineup_slots (
  id bigint generated always as identity primary key,
  matchday_number integer not null references public.ideal_matchdays (number) on delete cascade,
  slot_key text not null check (slot_key ~ '^(tit_por|tit_(def|med|del)_[0-9]+|sup_[1-9][0-9]*)$'),
  player_id bigint references public.players (id) on delete set null,
  points integer,
  appearances integer not null default 0 check (appearances >= 0),
  is_mvp boolean not null default false,
  is_not_lined_up boolean not null default false,
  bench_position text,
  constraint ideal_lineup_slots_bench_position_chk check (
    (slot_key like 'sup_%' and (bench_position is null or bench_position in ('POR', 'DEF', 'MED', 'DEL')))
    or (slot_key not like 'sup_%' and bench_position is null)
  ),
  constraint ideal_lineup_slots_matchday_slot_key unique (matchday_number, slot_key)
);

create unique index ideal_lineup_slots_one_player_idx
  on public.ideal_lineup_slots (matchday_number, player_id)
  where player_id is not null;

create unique index ideal_lineup_slots_one_mvp_idx
  on public.ideal_lineup_slots (matchday_number)
  where is_mvp;

create index ideal_lineup_slots_player_id_idx
  on public.ideal_lineup_slots (player_id);

alter table public.ideal_editors enable row level security;
alter table public.ideal_matchdays enable row level security;
alter table public.ideal_lineup_slots enable row level security;

create policy ideal_editors_select_self
  on public.ideal_editors
  for select
  to authenticated
  using (manager_id = public.current_manager_id());

create policy ideal_matchdays_editors
  on public.ideal_matchdays
  for all
  to authenticated
  using (
    exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  )
  with check (
    exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );

create policy ideal_lineup_slots_editors
  on public.ideal_lineup_slots
  for all
  to authenticated
  using (
    exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  )
  with check (
    exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );

revoke all on public.ideal_editors from anon, public;
revoke all on public.ideal_matchdays from anon, public;
revoke all on public.ideal_lineup_slots from anon, public;

grant select on public.ideal_editors to authenticated;
grant select, insert, update, delete on public.ideal_matchdays to authenticated;
grant select, insert, update, delete on public.ideal_lineup_slots to authenticated;
grant usage, select on sequence public.ideal_lineup_slots_id_seq to authenticated;
