alter table public.ideal_matchdays drop constraint ideal_matchdays_formation_check;
alter table public.ideal_matchdays add constraint ideal_matchdays_formation_check
  check (formation in ('4-4-2', '4-3-3', '3-4-3', '3-5-2', '5-3-2', '4-5-1'));
