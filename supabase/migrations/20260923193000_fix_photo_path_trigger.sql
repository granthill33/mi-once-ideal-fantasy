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

revoke all on function public.protect_player_photo_path() from public, anon, authenticated;
