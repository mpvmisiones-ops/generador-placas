-- =====================================================================
-- Generador de Placas · Esquema de base de datos (Etapa 1)
-- Pegar COMPLETO en Supabase > SQL Editor > New query > Run.
-- Se puede volver a ejecutar sin romper nada.
-- =====================================================================

-- ---------- Perfiles (1 por usuario de Supabase Auth) ----------
create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  usuario     text not null unique,
  nombre      text not null default '',
  rol         text not null default 'productor' check (rol in ('admin','productor')),
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);

-- ¿El usuario actual es admin activo?
create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

-- ¿El usuario actual está activo (cualquier rol)?
create or replace function public.es_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

-- Al crear un usuario en Auth se crea su perfil automáticamente.
-- El rol viene de app_metadata (solo lo puede poner el servidor, no el usuario).
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, usuario, nombre, rol)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'nombre', ''),
    case when new.raw_app_meta_data->>'rol' = 'admin' then 'admin' else 'productor' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario after insert on auth.users
  for each row execute function public.crear_perfil();

alter table public.perfiles enable row level security;
drop policy if exists "perfil propio o admin" on public.perfiles;
create policy "perfil propio o admin" on public.perfiles
  for select to authenticated using (id = auth.uid() or public.es_admin());
-- Sin políticas de insert/update/delete: solo la función del servidor (admin-usuarios) modifica perfiles.

-- ---------- Medios / plantillas ----------
create table if not exists public.medios (
  id           text primary key,             -- ej: 'muy-temprano'
  nombre       text not null,
  orden        int  not null default 0,
  en_rotacion  boolean not null default true, -- false = no recibe placa
  es_neutra    boolean not null default false,
  capa_path    text,                          -- PNG transparente en Storage (bucket 'capas')
  fuente_path  text,                          -- archivo de tipografía en Storage (bucket 'tipografias')
  config       jsonb not null default '{}'::jsonb, -- zonas de foto y título, tipografía, colores
  actualizado_en timestamptz not null default now()
);

alter table public.medios enable row level security;
drop policy if exists "leer medios" on public.medios;
create policy "leer medios" on public.medios
  for select to authenticated using (public.es_activo());
drop policy if exists "admin edita medios" on public.medios;
create policy "admin edita medios" on public.medios
  for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- ---------- Historial (solo textos y asignaciones, sin fotos) ----------
create table if not exists public.historial (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  creado_en   timestamptz not null default now(),
  punteo      text not null,
  resultado   jsonb not null default '{}'::jsonb  -- qué título y qué foto tocó a cada medio
);

alter table public.historial enable row level security;
drop policy if exists "ver historial" on public.historial;
create policy "ver historial" on public.historial
  for select to authenticated using (usuario_id = auth.uid() or public.es_admin());
drop policy if exists "guardar historial" on public.historial;
create policy "guardar historial" on public.historial
  for insert to authenticated with check (usuario_id = auth.uid() and public.es_activo());
drop policy if exists "admin borra historial" on public.historial;
create policy "admin borra historial" on public.historial
  for delete to authenticated using (public.es_admin());

-- ---------- Almacenamiento (capas PNG y tipografías) ----------
insert into storage.buckets (id, name, public)
values ('capas','capas', true), ('tipografias','tipografias', true)
on conflict (id) do nothing;

drop policy if exists "admin sube archivos" on storage.objects;
create policy "admin sube archivos" on storage.objects
  for insert to authenticated with check (bucket_id in ('capas','tipografias') and public.es_admin());
drop policy if exists "admin cambia archivos" on storage.objects;
create policy "admin cambia archivos" on storage.objects
  for update to authenticated using (bucket_id in ('capas','tipografias') and public.es_admin());
drop policy if exists "admin borra archivos" on storage.objects;
create policy "admin borra archivos" on storage.objects
  for delete to authenticated using (bucket_id in ('capas','tipografias') and public.es_admin());

-- ---------- Datos iniciales de los 11 medios (medidas tomadas del Canva) ----------
-- titulo: caja x,y,w,h en px sobre 1080x1350 · foto: zona x,y,w,h
insert into public.medios (id, nombre, orden, es_neutra, config) values
('muy-temprano','Muy Temprano',1,false,'{"titulo":{"x":177,"y":1011,"w":728,"h":321,"fuente":"Montserrat","peso":800,"tam":56,"color":"#ffffff","interlineado":1.15,"espaciado":0,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":1350}}'),
('interesante','Interesante',2,false,'{"titulo":{"x":114,"y":934,"w":852,"h":428,"fuente":"Oak Sans","peso":800,"tam":58,"color":"#fdfdfd","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":1350}}'),
('extensiones','Extensiones',3,false,'{"titulo":{"x":177,"y":921,"w":775,"h":352,"fuente":"Montserrat","peso":800,"tam":56,"color":"#ffffff","interlineado":1.15,"espaciado":0,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":1172}}'),
('radar-legislativo','Radar Legislativo',4,false,'{"titulo":{"x":134,"y":854,"w":838,"h":404,"fuente":"Open Sans","peso":800,"tam":50,"color":"#cee6e9","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":826}}'),
('misiones-biodiversidad','Misiones Biodiversidad',5,false,'{"titulo":{"x":174,"y":829,"w":728,"h":375,"fuente":"Poppins","peso":700,"tam":50,"color":"#6c0c0b","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":846}}'),
('central-de-noticias','Central de Noticias',6,false,'{"titulo":{"x":78,"y":958,"w":949,"h":364,"fuente":"Lato","peso":900,"tam":58,"color":"#ffffff","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":108,"w":1080,"h":821}}'),
('zona-random','Zona Random',7,false,'{"titulo":{"x":404,"y":729,"w":633,"h":326,"fuente":"Bebas Neue","peso":700,"tam":73,"color":"#000000","interlineado":1.09,"espaciado":-0.01,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":914,"h":1350}}'),
('misiones-digital','Misiones Digital',8,false,'{"titulo":{"x":160,"y":855,"w":665,"h":420,"fuente":"Archivo Black","peso":400,"tam":44,"color":"#ffffff","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":229,"y":0,"w":851,"h":1350}}'),
('hola-misiones','Hola Misiones',9,false,'{"titulo":{"x":82,"y":926,"w":916,"h":291,"fuente":"Archivo Black","peso":400,"tam":44,"color":"#ffffff","interlineado":1.11,"espaciado":-0.052,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":801}}'),
('canal-12','Canal 12',10,false,'{"titulo":{"x":108,"y":887,"w":916,"h":294,"fuente":"Inter","peso":900,"tam":65,"color":"#ffffff","interlineado":1.11,"espaciado":0,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":801}}'),
('neutra','NEUTRA',11,true,'{"titulo":{"x":46,"y":875,"w":1014,"h":491,"fuente":"Montserrat","peso":800,"tam":56,"color":"#ffffff","interlineado":1.15,"espaciado":0,"mayus":true,"alinear":"left"},"foto":{"x":0,"y":0,"w":1080,"h":1350}}')
on conflict (id) do nothing;
