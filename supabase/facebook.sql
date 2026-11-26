-- Generador de Placas · publicar en Facebook. Se puede volver a ejecutar.
-- La conexión con Facebook (token) vive solo en el navegador de quien publica: la base no guarda tokens.
-- Acá se guardan solo el permiso de cada usuario y qué página de Facebook corresponde a cada medio.

-- 1) Permiso especial por usuario: el admin lo habilita desde Usuarios (función admin-usuarios).
--    Los admins siempre pueden publicar. La web no puede cambiarlo (perfiles no tiene UPDATE para los usuarios).
alter table public.perfiles add column if not exists puede_publicar boolean not null default false;

create or replace function public.puede_publicar()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles p
                 where p.id = auth.uid() and p.activo and (p.rol = 'admin' or p.puede_publicar));
$$;
revoke execute on function public.puede_publicar() from public, anon;
grant execute on function public.puede_publicar() to authenticated;

-- 2) Página de Facebook de cada medio (la elige quien publica la primera vez; la ven todos los activos).
create table if not exists public.facebook_paginas (
  medio_id        text primary key references public.medios(id) on delete cascade,
  pagina_id       text not null check (pagina_id ~ '^\d{5,25}$'),
  pagina_nombre   text not null default '' check (char_length(pagina_nombre) <= 200),
  actualizado_por uuid default auth.uid(),
  actualizado_en  timestamptz not null default now()
);
alter table public.facebook_paginas enable row level security;
revoke all on public.facebook_paginas from anon, authenticated;
grant select, insert, update, delete on public.facebook_paginas to authenticated;

drop policy if exists "fb: ver" on public.facebook_paginas;
drop policy if exists "fb: cargar" on public.facebook_paginas;
drop policy if exists "fb: cambiar" on public.facebook_paginas;
drop policy if exists "fb: quitar" on public.facebook_paginas;
create policy "fb: ver" on public.facebook_paginas for select to authenticated using (public.es_activo());
create policy "fb: cargar" on public.facebook_paginas for insert to authenticated with check (public.puede_publicar());
create policy "fb: cambiar" on public.facebook_paginas for update to authenticated using (public.puede_publicar()) with check (public.puede_publicar());
create policy "fb: quitar" on public.facebook_paginas for delete to authenticated using (public.puede_publicar());

-- Quién y cuándo los pone la base.
create or replace function public.facebook_paginas_sellar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.actualizado_por := auth.uid(); new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists facebook_paginas_sellar on public.facebook_paginas;
create trigger facebook_paginas_sellar before insert or update on public.facebook_paginas
  for each row execute function public.facebook_paginas_sellar();
revoke execute on function public.facebook_paginas_sellar() from public, anon, authenticated;
