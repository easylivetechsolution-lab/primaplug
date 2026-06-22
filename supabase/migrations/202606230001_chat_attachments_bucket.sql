-- Create chat-attachments storage bucket for image/file sharing in chat
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  true,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/gif','image/webp','image/heic','image/svg+xml','video/mp4','video/quicktime','application/pdf']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users can upload chat attachments"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow anyone to read chat attachments (public bucket)
create policy "Anyone can read chat attachments"
  on storage.objects for select
  to public
  using (bucket_id = 'chat-attachments');

-- Allow users to delete their own files
create policy "Users can delete own chat attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
