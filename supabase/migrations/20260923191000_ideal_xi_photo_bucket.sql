insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'player-photos',
  'player-photos',
  false,
  5242880,
  array['image/webp', 'image/jpeg', 'image/png']
);

create policy ideal_player_photos_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'player-photos'
    and exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );

create policy ideal_player_photos_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'player-photos'
    and exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );

create policy ideal_player_photos_update
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'player-photos'
    and exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  )
  with check (
    bucket_id = 'player-photos'
    and exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );

create policy ideal_player_photos_delete
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'player-photos'
    and exists (
      select 1 from public.ideal_editors e
      where e.manager_id = public.current_manager_id()
    )
  );
