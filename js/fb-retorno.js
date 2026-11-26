// Vuelta de Facebook: pasa la respuesta (en el # de la dirección) a la pestaña del generador y se cierra.
// Solo se comunica con pestañas de este mismo sitio (BroadcastChannel es por origen).
(() => {
  const hash = location.hash;
  history.replaceState(null, "", location.pathname); // que el permiso no quede en la dirección ni en el historial
  try { const c = new BroadcastChannel("placas-fb"); c.postMessage({ tipo: "fb-retorno", hash }); c.close(); } catch {}
  document.getElementById("msg").textContent = "Listo. Podés cerrar esta ventana y volver al generador.";
  setTimeout(() => window.close(), 400);
})();
