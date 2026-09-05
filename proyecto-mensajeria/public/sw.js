// Service worker de Web Push (ADR-0033). Archivo plano, servido tal cual
// desde la raíz (no pasa por el bundler de Vite) — igual que favicon.ico en
// esta misma carpeta. Solo maneja push/click; no cachea nada ni intercepta
// `fetch` (no es un service worker de offline/PWA, eso no se pidió).

self.addEventListener("push", (event) => {
  let payload = { title: "Aviso", body: "" };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Si el payload no es JSON válido, se muestra un aviso genérico en vez
    // de tumbar el evento de push.
  }

  event.waitUntil(
    (async () => {
      // Bug real reportado 2026-09-05: con la app cerrada/en segundo plano
      // llegaban solo ALGUNOS mensajes, no todos. Causa real encontrada
      // aquí mismo: antes se pedía `clients.matchAll` y se comparaba
      // `client.focused` para saltarse el aviso "si ya hay una pestaña
      // enfocada" (asumiendo que Realtime/Socket.IO ya lo mostró en vivo) —
      // pero en móvil (sobre todo la PWA instalada en iOS) `focused` no
      // refleja de forma confiable si la persona de verdad está viendo la
      // pantalla en ese momento; a veces marcaba `focused: true` con la app
      // en segundo plano de verdad, y esa comprobación se comía el aviso
      // en silencio. Perder un mensaje real es peor que, en el peor caso,
      // duplicar un aviso mientras la persona ya tiene la pestaña abierta
      // — así que ahora siempre se muestra.
      await self.registration.showNotification(payload.title ?? "Aviso", {
        body: payload.body ?? "",
        icon: "/favicon.ico",
        data: payload.data ?? {},
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientsList.find((client) =>
        client.url.includes(targetUrl),
      );
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
