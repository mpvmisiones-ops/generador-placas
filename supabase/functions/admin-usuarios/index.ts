// Función de Supabase "admin-usuarios".
// Solo un admin activo puede usarla. La clave maestra (SUPABASE_SERVICE_ROLE_KEY)
// la provee Supabase automáticamente: NUNCA está en el repositorio ni en el navegador.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMINIO = "placas.local"; // los usuarios se guardan como usuario@placas.local
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Clave secreta que Supabase inyecta en el servidor (formato viejo o nuevo).
    let secreta = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!secreta) {
      try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); secreta = k.default ?? Object.values(k)[0] ?? ""; } catch { /* nada */ }
    }
    if (!secreta) return responder({ error: "Falta la clave secreta del servidor." }, 500);
    const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

    const cuerpo = await req.json();

    // 0) Primera configuración: crear el primer admin. Solo funciona si NO existe ningún usuario.
    if (cuerpo.accion === "inicializar") {
      const { count } = await admin.from("perfiles").select("id", { count: "exact", head: true });
      if ((count ?? 0) > 0) return responder({ error: "La herramienta ya está configurada." }, 403);
      const usuario = String(cuerpo.usuario ?? "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return responder({ error: "El usuario debe tener de 3 a 30 letras o números, sin espacios ni acentos." }, 400);
      if (String(cuerpo.password ?? "").length < 8) return responder({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`, password: cuerpo.password, email_confirm: true,
        user_metadata: { nombre: String(cuerpo.nombre ?? "").trim() }, app_metadata: { rol: "admin" },
      });
      if (error) return responder({ error: error.message }, 400);
      return responder({ ok: true });
    }

    // 1) ¿Quién llama? Debe ser admin activo.
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: quien } = await admin.auth.getUser(token);
    if (!quien?.user) return responder({ error: "Sesión no válida." }, 401);
    const { data: perfil } = await admin.from("perfiles").select("rol, activo").eq("id", quien.user.id).single();
    if (!perfil || perfil.rol !== "admin" || !perfil.activo) return responder({ error: "Solo el administrador puede hacer esto." }, 403);

    const { accion, ...d } = cuerpo;

    if (accion === "listar") {
      const { data, error } = await admin.from("perfiles").select("id, usuario, nombre, rol, activo, creado_en").order("usuario");
      if (error) throw error;
      return responder({ usuarios: data });
    }

    if (accion === "crear") {
      const usuario = String(d.usuario ?? "").trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return responder({ error: "El usuario debe tener de 3 a 30 letras o números, sin espacios ni acentos." }, 400);
      if (String(d.password ?? "").length < 8) return responder({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      const rol = d.rol === "admin" ? "admin" : "productor";
      const { data, error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`,
        password: d.password,
        email_confirm: true,
        user_metadata: { nombre: String(d.nombre ?? "").trim() },
        app_metadata: { rol },
      });
      if (error) return responder({ error: error.message.includes("already") ? "Ese usuario ya existe." : error.message }, 400);
      return responder({ ok: true, id: data.user.id });
    }

    if (accion === "pausar" || accion === "reactivar") {
      if (d.id === quien.user.id) return responder({ error: "No podés pausarte a vos mismo." }, 400);
      const activo = accion === "reactivar";
      const { error } = await admin.auth.admin.updateUserById(d.id, { ban_duration: activo ? "none" : "876000h" });
      if (error) throw error;
      await admin.from("perfiles").update({ activo }).eq("id", d.id);
      return responder({ ok: true });
    }

    if (accion === "cambiar_password") {
      if (String(d.password ?? "").length < 8) return responder({ error: "La contraseña debe tener al menos 8 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(d.id, { password: d.password });
      if (error) throw error;
      return responder({ ok: true });
    }

    if (accion === "cambiar_rol") {
      if (d.id === quien.user.id) return responder({ error: "No podés cambiar tu propio rol." }, 400);
      const rol = d.rol === "admin" ? "admin" : "productor";
      await admin.auth.admin.updateUserById(d.id, { app_metadata: { rol } });
      const { error } = await admin.from("perfiles").update({ rol }).eq("id", d.id);
      if (error) throw error;
      return responder({ ok: true });
    }

    return responder({ error: "Acción desconocida." }, 400);
  } catch (e) {
    return responder({ error: "Error del servidor: " + (e?.message ?? e) }, 500);
  }
});
