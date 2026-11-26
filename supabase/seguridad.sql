-- Generador de Placas · endurecimiento de seguridad (2026-11-25). Se puede volver a ejecutar.
-- Segunda barrera además de las reglas RLS: cada rol solo tiene los permisos que la web usa,
-- la base fija autor/fecha del historial, guarda copias antes de cada corrección y valida los datos.

-- ===================== 1) Permisos por tabla =====================
-- El visitante sin sesión (anon) no toca ninguna tabla; solo llama a hay_usuarios().
revoke all on public.perfiles, public.medios, public.historial from anon;
-- Con sesión: solo lo que usa la web. (TRUNCATE no respeta RLS: fuera.)
revoke all on public.perfiles, public.medios, public.historial from authenticated;
grant select on public.perfiles to authenticated;                    -- perfiles: solo la función del servidor los cambia
grant select, update on public.medios to authenticated;              -- update: RLS lo limita al admin
grant select, delete on public.historial to authenticated;           -- delete: RLS lo limita al admin
grant insert (punteo, resultado) on public.historial to authenticated; -- autor y fecha los pone la base
grant update (punteo, resultado) on public.historial to authenticated; -- corregir sin tocar autor ni fecha
grant usage, select on all sequences in schema public to authenticated;

-- ===================== 2) Historial: quién corrigió, copias y validación =====================
alter table public.historial add column if not exists editado_por uuid references public.perfiles(id) on delete set null;
alter table public.historial add column if not exists editado_en timestamptz;

-- Copia de cada tanda antes de cada corrección (para recuperar si alguien la arruina). Solo el admin la ve.
create table if not exists public.historial_versiones (
  id            bigint generated always as identity primary key,
  historial_id  bigint not null,
  guardado_en   timestamptz not null default now(),
  guardado_por  uuid,
  punteo        text,
  resultado     jsonb
);
alter table public.historial_versiones enable row level security;
revoke all on public.historial_versiones from anon, authenticated;
grant select on public.historial_versiones to authenticated;
drop policy if exists "admin ve versiones" on public.historial_versiones;
create policy "admin ve versiones" on public.historial_versiones for select to authenticated using (public.es_admin());

create or replace function public.historial_sellar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Forma y tamaño: evita filas que rompan la pantalla del historial o llenen la base.
  if new.resultado is null or jsonb_typeof(new.resultado) <> 'object'
     or jsonb_typeof(coalesce(new.resultado->'noticias', '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(new.resultado->'placas', '[]'::jsonb)) <> 'array'
     or exists (select 1 from jsonb_array_elements(coalesce(new.resultado->'noticias', '[]'::jsonb)) n
                where jsonb_typeof(n) <> 'object'
                   or jsonb_typeof(coalesce(n->'titulos', '[]'::jsonb)) <> 'array'
                   or jsonb_typeof(coalesce(n->'fotos', '[]'::jsonb)) <> 'array')
     or octet_length(coalesce(new.punteo, '')) > 100000
     or pg_column_size(new.resultado) > 400000 then
    raise exception 'historial: datos inválidos' using errcode = '22023';
  end if;
  if tg_op = 'INSERT' then
    new.usuario_id := auth.uid(); new.creado_en := now(); new.editado_por := null; new.editado_en := null;
  else
    insert into public.historial_versiones (historial_id, guardado_por, punteo, resultado)
    values (old.id, auth.uid(), old.punteo, old.resultado);
    new.usuario_id := old.usuario_id; new.creado_en := old.creado_en;
    new.editado_por := auth.uid(); new.editado_en := now();
  end if;
  return new;
end $$;
drop trigger if exists historial_sellar on public.historial;
create trigger historial_sellar before insert or update on public.historial
  for each row execute function public.historial_sellar();
revoke execute on function public.historial_sellar() from public, anon, authenticated;

-- Nombres de los usuarios (para mostrar autor y corrector reales; un productor no puede leer perfiles ajenos).
create or replace function public.autores()
returns table (id uuid, nombre text) language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.nombre, ''), p.usuario) from public.perfiles p where public.es_activo();
$$;
revoke execute on function public.autores() from public, anon;
grant execute on function public.autores() to authenticated;

-- Fotos que se pueden borrar con una tanda: solo las suyas y que ninguna otra tanda use. Solo admin.
create or replace function public.fotos_solo_de(tanda bigint)
returns setof text language sql stable security definer set search_path = public as $$
  select distinct f->>'path'
  from public.historial h,
       jsonb_array_elements(coalesce(h.resultado->'noticias', '[]'::jsonb)) n,
       jsonb_array_elements(coalesce(n->'fotos', '[]'::jsonb)) f
  where h.id = tanda and public.es_admin()
    and jsonb_typeof(f) = 'object'
    and f->>'path' ~ '^\d{4}-\d{2}-\d{2}/[0-9a-f-]{36}\.jpg$'
    and not exists (
      select 1 from public.historial o,
             jsonb_array_elements(coalesce(o.resultado->'noticias', '[]'::jsonb)) n2,
             jsonb_array_elements(coalesce(n2->'fotos', '[]'::jsonb)) f2
      where o.id <> tanda and jsonb_typeof(f2) = 'object' and f2->>'path' = f->>'path');
$$;
revoke execute on function public.fotos_solo_de(bigint) from public, anon;
grant execute on function public.fotos_solo_de(bigint) to authenticated;

-- ===================== 3) Sesiones =====================
-- Cierra todas las sesiones de un usuario (la llama la función del servidor al pausar o cambiar contraseña).
create or replace function public.cerrar_sesiones(uid uuid)
returns void language sql security definer set search_path = auth, public as $$
  delete from auth.sessions where user_id = uid;
$$;
revoke execute on function public.cerrar_sesiones(uuid) from public, anon, authenticated;
grant execute on function public.cerrar_sesiones(uuid) to service_role;

-- ===================== 4) Funciones internas =====================
revoke execute on function public.es_admin() from public, anon;
revoke execute on function public.es_activo() from public, anon;
grant execute on function public.es_admin(), public.es_activo() to authenticated; -- las usan las reglas RLS
do $$ begin
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
-- hay_usuarios() sigue abierta: la pantalla de inicio la necesita y solo responde sí/no.

-- ===================== 5) Alta de usuarios =====================
-- El perfil nace PAUSADO y solo para usuarios @placas.local. La función del servidor lo activa al crearlo.
-- Si algún día se habilitara el registro público por error, esas cuentas no tienen acceso a nada.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if split_part(coalesce(new.email, ''), '@', 2) <> 'placas.local' then return new; end if;
  insert into public.perfiles (id, usuario, nombre, rol, activo)
  values (new.id, split_part(new.email, '@', 1), coalesce(new.raw_user_meta_data->>'nombre', ''), 'productor', false)
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.crear_perfil() from public, anon, authenticated;

-- ===================== 6) Archivos =====================
update storage.buckets set file_size_limit = 5 * 1024 * 1024, allowed_mime_types = array['image/jpeg'] where id = 'historial';
update storage.buckets set file_size_limit = 10 * 1024 * 1024, allowed_mime_types = array['image/png'] where id = 'capas';
update storage.buckets set file_size_limit = 5 * 1024 * 1024 where id = 'tipografias';
drop policy if exists "historial: subir fotos" on storage.objects;
create policy "historial: subir fotos" on storage.objects for insert to authenticated
  with check (bucket_id = 'historial' and public.es_activo()
              and name ~ '^\d{4}-\d{2}-\d{2}/[0-9a-f-]{36}\.jpg$');
