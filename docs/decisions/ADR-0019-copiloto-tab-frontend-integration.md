# ADR-0019 — Integración real: pestaña "Copiloto" en `proyecto-mensajeria`

**Fecha:** 2026-08-19
**Estado:** Aceptado — verificado con typecheck/lint/build limpios (incluye build de producción completo). Verificación end-to-end contra sesión real del fundador queda pendiente (ver Verificación).

## Contexto

Hasta este punto, "Modo de manejo", "Emergencia", "Recordatorios" y
"Notificaciones" existían solo como (a) endpoints/servicios reales de
backend (ADR-0009 a ADR-0017) y (b) un mockup HTML visual aislado
(`docs/product/mockups/copiloto-mockup.html`) — sin ninguna pantalla real
dentro de la app de mensajería que un usuario pudiera abrir.

El fundador preguntó explícitamente por qué el mockup se construyó aparte
en vez de sobre `proyecto-mensajeria/`, señalando correctamente que "todo
es un solo producto". Se confirmó que la razón fue de velocidad/alcance del
mockup (mostrar la idea visual rápido), no una duda arquitectónica — y se
decidió, a su pedido, construir la integración real ahora: primero el
puente de mensajería del asistente (ADR-0018), después esta pieza.

## Decisión

Se agregó una 5ª pestaña principal, "Copiloto", a la navegación existente
de `proyecto-mensajeria` (`TabBar.tsx`, `MainTabKey`), siguiendo el mismo
patrón arquitectónico que ya usan Chats/Notas/Contactos/Perfil: una sola
ruta (`/`) con un `MainShell` que cambia de pantalla por estado, no rutas
nuevas.

Piezas nuevas, todas reales (ningún dato inventado):

- `src/lib/backend/client.ts` — cliente HTTP mínimo hacia el backend NestJS
  (`VITE_BACKEND_URL`), con manejo de `BackendError` (incluye `status`, usado
  para distinguir 403 "no soy ambulancia" de otros errores).
- `useDrivingMode` — `GET/POST/DELETE /vehicles`, `/vehicles/driving-mode`
  (ADR-0014).
- `useLocationReminders` — `GET/POST/DELETE /location-reminders`, geocodifica
  direcciones de texto vía `GET /navigation/geocode` (ADR-0010/0015).
- `useCopilotoRealtime` — conexión real por `socket.io-client` al namespace
  `/location` (ADR-0009): reporta GPS real del navegador
  (`navigator.geolocation.watchPosition`) y escucha `corridor:alert`
  (ADR-0013/0017) en vivo. Es una sola conexión compartida entre las
  pantallas de Emergencia y Notificaciones — no se abren sockets duplicados.
  También detecta si el usuario es ambulancia verificada consultando
  `GET /emergency/corridor/candidates` (403 = no lo es; se trata como señal
  de rol, no como error a mostrar).
- 4 pantallas (`ModoManejoScreen`, `RecordatoriosScreen`, `EmergenciaScreen`,
  `NotificacionesScreen`) siguiendo la convención visual existente
  (`PhoneScreen`, `tabBar` como último hijo). `NotificacionesScreen` es
  honesta sobre su alcance: solo muestra eventos de la sesión actual (no
  existe todavía una tabla de notificaciones persistida en el backend).

## Decisiones de diseño relevantes

- **Reporte de ubicación activado de verdad, no solo durante navegación**:
  `useCopilotoRealtime` llama `watchPosition` apenas se monta la pestaña
  Copiloto — cierra el gap de producto que `MISSING_CAPABILITIES.md` traía
  documentado desde ADR-0013 ("candidatos con ubicación vieja/inactiva").
  Todavía depende de que el usuario conceda permiso de ubicación del
  navegador; no hay solicitud proactiva de permiso en otras pantallas.
- **`subNav` como prop, no overlay posicionado**: la primera versión de
  `CopilotoTab` usaba un hack de posicionamiento absoluto para superponer
  un selector de sub-pantalla sobre el header de cada pantalla. Se detectó
  como fragil antes de cerrar y se reemplazó por un prop `subNav?: ReactNode`
  que cada pantalla renderiza en flujo normal — autocorrección, no reportada
  por el fundador.
- **CORS habilitado solo fuera de producción** (`backend/src/main.ts`) —
  necesario porque el front-end corre en un puerto de Vite distinto al
  backend; se usa `Authorization: Bearer`, no cookies, así que
  `credentials: true` no aplica.

## Verificación

- `typecheck`/`lint`/`build` limpios en `proyecto-mensajeria/`, incluyendo
  el build de producción completo (cliente + SSR + worker Cloudflare/Nitro).
- 53 errores de formato Prettier/ESLint preexistentes **en los archivos
  nuevos de este slice** corregidos con `eslint --fix` (solo estilo).
- **Límite honesto, pendiente:** no se probó el flujo end-to-end contra una
  sesión real (login real + permiso de ubicación real + backend corriendo)
  porque este entorno no tiene la sesión del fundador. Los contratos HTTP/WS
  consumidos ya están verificados por separado en sus propios ADRs
  (0009–0017) — lo que falta verificar aquí es específicamente la unión
  frontend↔backend con credenciales reales, que le corresponde probar al
  fundador siguiendo la guía de prueba que se le entregó en el chat.

## Referencias

- `docs/decisions/ADR-0009-location-engine.md` a `ADR-0017-alert-channel-differentiation.md`
- `proyecto-mensajeria/src/components/copiloto/`, `src/hooks/use{DrivingMode,LocationReminders,CopilotoRealtime}.ts`, `src/lib/backend/client.ts`
- `docs/product/mockups/copiloto-mockup.html` (mockup original, ahora superado por la integración real)
