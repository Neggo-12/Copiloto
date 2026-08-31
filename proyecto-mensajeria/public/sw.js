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
      // Si ya hay una pestaña de la app enfocada, la persona ya lo está
      // viendo en vivo por Realtime/Socket.IO — no duplicar con un aviso
      // del sistema operativo encima.
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const hasFocusedClient = clientsList.some((client) => client.focused);
      if (hasFocusedClient) return;

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
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = clientsList.find((client) => client.url.includes(targetUrl));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
