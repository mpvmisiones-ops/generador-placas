-- Generador de Placas · historial general (se corre una sola vez en el SQL Editor de Supabase).
-- 1) Todos los usuarios activos ven el historial completo (antes: cada uno el suyo, el admin todo).
-- 2) Cualquiera puede corregir una tanda guardada (se actualiza la misma fila al volver a descargar).
-- 3) Fotos de las tandas en el Storage "historial" (privado: solo usuarios activos las ven).

drop policy if exists "ver historial" on public.historial;
create policy "ver historial" on public.historial
  for select to authenticated using (public.es_activo());

drop policy if exists "corregir historial" on public.historial;
create policy "corregir historial" on public.historial
  for update to authenticated using (public.es_activo()) with check (public.es_activo());

insert into storage.buckets (id, name, public)
values ('historial', 'historial', false)
on conflict (id) do nothing;

drop policy if exists "historial: ver fotos" on storage.objects;
create policy "historial: ver fotos" on storage.objects
  for select to authenticated using (bucket_id = 'historial' and public.es_activo());

drop policy if exists "historial: subir fotos" on storage.objects;
create policy "historial: subir fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'historial' and public.es_activo());

drop policy if exists "historial: borrar fotos" on storage.objects;
create policy "historial: borrar fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'historial' and public.es_admin());
