-- SoloR prototype — Storage bucket + Realtime publication (SPEC §7.6, §7.7)
-- Guarded so the migration also runs on a plain Postgres used for local SQL tests.

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    -- Public bucket with unguessable paths (prototype tech debt, see OPEN_QUESTIONS.md)
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('cut-media', 'cut-media', true, 209715200,
            array['image/jpeg','image/png','image/webp','image/heic','image/heif',
                  'video/mp4','video/quicktime','video/webm'])
    on conflict (id) do update set public = excluded.public,
                                   file_size_limit = excluded.file_size_limit,
                                   allowed_mime_types = excluded.allowed_mime_types;

    -- Path layout: {butcher_id}/{cut_id}/{uuid}.{ext}
    execute $p$
      create policy cut_media_read on storage.objects for select to authenticated
        using (bucket_id = 'cut-media')
    $p$;
    execute $p$
      create policy cut_media_insert_own on storage.objects for insert to authenticated
        with check (bucket_id = 'cut-media'
                    and (storage.foldername(name))[1] = public.current_butcher_id()::text)
    $p$;
    execute $p$
      create policy cut_media_update_own on storage.objects for update to authenticated
        using (bucket_id = 'cut-media'
               and (storage.foldername(name))[1] = public.current_butcher_id()::text)
    $p$;
    execute $p$
      create policy cut_media_delete_own on storage.objects for delete to authenticated
        using (bucket_id = 'cut-media'
               and (storage.foldername(name))[1] = public.current_butcher_id()::text)
    $p$;
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table cuts, orders;
  end if;
end $$;
