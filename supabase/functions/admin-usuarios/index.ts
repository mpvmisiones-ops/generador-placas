// Función de Supabase "admin-usuarios".
// Solo un admin activo puede usarla. La clave maestra (SUPABASE_SERVICE_ROLE_KEY)
// la provee Supabase automáticamente: NUNCA está en el repositorio ni en el navegador.
// Seguridad (2026-11-25): sin acción "inicializar" (la herramienta ya tiene admin), CORS solo para el
// sitio, entradas validadas, errores internos solo en el registro, y al pausar o cambiar la contraseña
// se cierran todas las sesiones abiertas de ese usuario.
import { createClient } from "jsr:@supabase/supabase-js@2";

const DOMINIO = "placas.local"; // los usuarios se guardan como usuario@placas.local
const SITIO = "https://mpvmisiones-ops.github.io";
const cors = {
  "Access-Control-Allow-Origin": SITIO,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const responder = (cuerpo: unknown, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...cors, "Content-Type": "application/json" } });

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ES_USUARIO = /^[a-z0-9._-]{3,30}$/;
// bcrypt solo usa los primeros 72 bytes: más largo no suma seguridad y confunde.
const claveValida = (p: unknown) => typeof p === "string" && p.length >= 8 && new TextEncoder().encode(p).length <= 72;
const texto = (t: unknown, max: number) => String(t ?? "").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return responder({ error: "Método no permitido." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    // Clave secreta que Supabase inyecta en el servidor (formato viejo o nuevo).
    let secreta = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!secreta) {
      try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}"); secreta = k.default ?? Object.values(k)[0] ?? ""; } catch { /* nada */ }
    }
    if (!secreta) { console.error("[admin-usuarios] falta la clave secreta"); return responder({ error: "Error del servidor." }, 500); }
    const admin = createClient(url, secreta, { auth: { persistSession: false, autoRefreshToken: false } });

    let cuerpo: Record<string, unknown>;
    try { cuerpo = await req.json(); } catch { return responder({ error: "Pedido inválido." }, 400); }
    if (!cuerpo || typeof cuerpo !== "object") return responder({ error: "Pedido inválido." }, 400);

    // La primera configuración ya se hizo: crear el primer admin desde afuera queda deshabilitado.
    if (cuerpo.accion === "inicializar") return responder({ error: "La herramienta ya está configurada." }, 403);

    // 1) ¿Quién llama? Debe ser admin activo.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return responder({ error: "Sesión no válida." }, 401);
    const { data: quien, error: errQuien } = await admin.auth.getUser(token);
    if (errQuien || !quien?.user) return responder({ error: "Sesión no válida." }, 401);
    const { data: perfil } = await admin.from("perfiles").select("rol, activo").eq("id", quien.user.id).single();
    if (!perfil || perfil.rol !== "admin" || !perfil.activo) return responder({ error: "Solo el administrador puede hacer esto." }, 403);

    const { accion, ...d } = cuerpo;
    const id = typeof d.id === "string" ? d.id : "";
    const necesitaId = ["pausar", "reactivar", "cambiar_password", "cambiar_rol"].includes(String(accion));
    if (necesitaId && !ES_UUID.test(id)) return responder({ error: "Usuario inválido." }, 400);

    // Cierra todas las sesiones de un usuario (función de la base solo para el servidor).
    const cerrarSesiones = async (uid: string) => {
      const { error } = await admin.rpc("cerrar_sesiones", { uid });
      if (error) console.error("[admin-usuarios] cerrar_sesiones:", error.message);
    };

    if (accion === "listar") {
      const { data, error } = await admin.from("perfiles").select("id, usuario, nombre, rol, activo, creado_en").order("usuario");
      if (error) throw error;
      return responder({ usuarios: data });
    }

    if (accion === "crear") {
      const usuario = texto(d.usuario, 30).toLowerCase();
      if (!ES_USUARIO.test(usuario)) return responder({ error: "El usuario debe tener de 3 a 30 letras o números, sin espacios ni acentos." }, 400);
      if (!claveValida(d.password)) return responder({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
      const rol = d.rol === "admin" ? "admin" : "productor";
      const { data, error } = await admin.auth.admin.createUser({
        email: `${usuario}@${DOMINIO}`,
        password: d.password as string,
        email_confirm: true,
        user_metadata: { nombre: texto(d.nombre, 60) },
        app_metadata: { rol },
      });
      if (error) {
        if (/already|registered|exists/i.test(error.message)) return responder({ error: "Ese usuario ya existe." }, 400);
        throw error;
      }
      // El perfil nace pausado (trigger crear_perfil): acá se activa y se fija el rol.
      const act = await admin.from("perfiles").update({ rol, activo: true }).eq("id", data.user.id);
      if (act.error) throw act.error;
      return responder({ ok: true, id: data.user.id });
    }

    if (accion === "pausar" || accion === "reactivar") {
      if (id === quien.user.id) return responder({ error: "No podés pausarte a vos mismo." }, 400);
      const activo = accion === "reactivar";
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: activo ? "none" : "876000h" });
      if (error) throw error;
      const act = await admin.from("perfiles").update({ activo }).eq("id", id);
      if (act.error) throw act.error;
      if (!activo) await cerrarSesiones(id);
      return responder({ ok: true });
    }

    if (accion === "cambiar_password") {
      if (!claveValida(d.password)) return responder({ error: "La contraseña debe tener entre 8 y 72 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(id, { password: d.password as string });
      if (error) throw error;
      if (id !== quien.user.id) await cerrarSesiones(id); // si alguien tenía la contraseña vieja, queda afuera
      return responder({ ok: true });
    }

    if (accion === "cambiar_rol") {
      if (id === quien.user.id) return responder({ error: "No podés cambiar tu propio rol." }, 400);
      const rol = d.rol === "admin" ? "admin" : "productor";
      const meta = await admin.auth.admin.updateUserById(id, { app_metadata: { rol } });
      if (meta.error) throw meta.error;
      const { error } = await admin.from("perfiles").update({ rol }).eq("id", id);
      if (error) throw error;
      return responder({ ok: true });
    }

    return responder({ error: "Acción desconocida." }, 400);
  } catch (e) {
    console.error("[admin-usuarios]", e);
    return responder({ error: "Error del servidor. Probá de nuevo; si sigue, avisale al administrador." }, 500);
  }
});
