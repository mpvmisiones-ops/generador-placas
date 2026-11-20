# Guía paso a paso: conectar Supabase

Tiempo estimado: 15 minutos. Todo se hace desde el navegador.

## 1. Crear la cuenta y el proyecto
1. Entrá a https://supabase.com y tocá **Start your project** → registrate con tu cuenta de GitHub (**mpvmisiones-ops**).
2. **New project**:
   - Name: `generador-placas`
   - Database Password: tocá **Generate a password** y guardala en un lugar seguro (no hace falta pasármela).
   - Region: **South America (São Paulo)**.
   - Plan: **Free**.
3. Esperá 1–2 minutos a que termine de crearse.

## 2. Crear las tablas y permisos
1. Menú izquierdo → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/esquema.sql` del proyecto, copiá TODO, pegalo y tocá **Run**.
3. Tiene que decir **Success. No rows returned**.

## 3. Crear la función que maneja los usuarios
1. Menú izquierdo → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre de la función: `admin-usuarios` (exacto).
3. Borrá el código de ejemplo, pegá TODO el contenido de `supabase/functions/admin-usuarios/index.ts` y tocá **Deploy function**.

## 4. Crear tu usuario administrador
1. Menú izquierdo → **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: `TUUSUARIO@placas.local` (ej: `martin@placas.local`). Solo letras/números, sin espacios.
3. Password: la que vas a usar para entrar.
4. Dejá tildado **Auto Confirm User** y tocá **Create user**.
5. Volvé a **SQL Editor** → **New query**, pegá esto (cambiando `TUUSUARIO`) y tocá **Run**:
   ```sql
   update public.perfiles set rol = 'admin' where usuario = 'TUUSUARIO';
   ```
   Los demás usuarios los vas a crear desde la propia web, en la pestaña **Usuarios**.

## 5. Desactivar registros públicos
**Authentication** → **Sign In / Providers** → apagá **Allow new users to sign up** → **Save**.
(Así nadie puede crearse una cuenta solo; únicamente el admin crea usuarios.)

## 6. Pasarme la dirección y la clave pública
**Project Settings** (engranaje) → **API Keys** / **Data API**. Copiá y pegame en el chat:
- **Project URL** (ej: `https://abcdefgh.supabase.co`)
- **Publishable key** (empieza con `sb_publishable_`) — si no aparece, la **anon public** key.

⚠️ **NUNCA** me pases ni pegues en ningún lado la **secret key** ni la **service_role key**.
