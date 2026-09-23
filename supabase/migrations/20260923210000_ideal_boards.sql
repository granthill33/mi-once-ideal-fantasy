create table public.ideal_boards (
  kind text primary key check (kind in ('media', 'totales')),
  formation text not null default '4-4-2' check (formation in ('4-4-2', '4-3-3', '3-4-3', '3-5-2', '5-3-2', '4-5-1')),
  bench_count integer not null default 7 check (bench_count between 0 and 12),
  updated_at timestamptz not null default now()
);

create table public.ideal_board_slots (
  id bigint generated always as identity primary key,
  board_kind text not null references public.ideal_boards (kind) on delete cascade,
  slot_key text not null check (slot_key ~ '^(tit_por|tit_(def|med|del)_[0-9]+|sup_[1-9][0-9]*)$'),
  player_id bigint references public.players (id) on delete set null,
  points numeric,
  appearances integer not null default 0 check (appearances >= 0),
  matches integer,
  bench_position text,
  constraint ideal_board_slots_bench_position_chk check (
    (slot_key like 'sup_%' and (bench_position is null or bench_position in ('POR', 'DEF', 'MED', 'DEL')))
    or (slot_key not like 'sup_%' and bench_position is null)
  ),
  constraint ideal_board_slots_matches_chk check (
    (board_kind = 'media' and (matches is null or matches >= 0))
    or (board_kind = 'totales' and matches is null)
  ),
  constraint ideal_board_slots_kind_slot_key unique (board_kind, slot_key)
);

create unique index ideal_board_slots_one_player_idx
  on public.ideal_board_slots (board_kind, player_id)
  where player_id is not null;

create index ideal_board_slots_player_id_idx
  on public.ideal_board_slots (player_id);

alter table public.ideal_boards enable row level security;
alter table public.ideal_board_slots enable row level security;

create policy ideal_boards_editors
  on public.ideal_boards
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

create policy ideal_board_slots_editors
  on public.ideal_board_slots
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

revoke all on public.ideal_boards from anon, public;
revoke all on public.ideal_board_slots from anon, public;

grant select, insert, update, delete on public.ideal_boards to authenticated;
grant select, insert, update, delete on public.ideal_board_slots to authenticated;
grant usage, select on sequence public.ideal_board_slots_id_seq to authenticated;
