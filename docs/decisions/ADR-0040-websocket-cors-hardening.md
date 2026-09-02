# ADR-0040: Fase 8 (Seguridad) — CORS real de los gateways de WebSocket, corregido

- Fecha: 2026-09-02
- Estado: **corregido**, con verificación real de los 4 casos.

## Contexto

Último pendiente real del bloque Seguridad de la Fase 8: ambos gateways
(`LocationGateway`, `AssistantVoiceGateway`) usaban `cors: { origin: "*" }`
fijo — señalado como hallazgo menor desde ADR-0036, deliberadamente NO
corregido en ese momento por no tener todavía un dominio real de producción
que restringir. El fundador pidió priorizar seguridad ("continua con la
proteccion hay que darle prioridad a la seguridad") — este era el único
punto de seguridad real todavía accionable con código (el otro punto
pendiente, "Leaked Password Protection" de Supabase Auth, resultó estar
bloqueado por el plan — ver abajo).

## Corrección real

Nuevo helper compartido, `resolveWebSocketCorsOrigin()`
(`common/websocket/websocket-cors.ts`), usado por ambos gateways en vez del
`"*"` fijo:

- **Fuera de producción** (`NODE_ENV !== "production"`, incluye desarrollo
  local sin `NODE_ENV` puesto): permisivo (`origin: true`) — mismo criterio
  que ya usa el CORS HTTP real de `main.ts` en desarrollo.
- **En producción sin `CORS_ORIGIN` configurado**: CORS de WebSocket
  **deshabilitado** (`origin: false`) — nunca cae a `"*"` por defecto. Mismo
  criterio que ya aplica `main.ts` al CORS HTTP ("deshabilitado hasta que
  exista un dominio real que restringir explícitamente").
- **En producción con `CORS_ORIGIN` configurado**: lista real de orígenes
  (separados por coma, recortados).

## Detalle técnico real, verificado antes de escribir código

El objeto `cors` del decorador `@WebSocketGateway(...)` se evalúa en el
momento en que Node IMPORTA el archivo del gateway — no cuando arranca la
app. Se confirmó leyendo el orden real de imports de `app.module.ts`:
`LocationModule` (que importa `LocationGateway`) aparece en el array
`imports` del `@Module` de `AppModule`, así que Node ya terminó de evaluar
por completo ese archivo (y por lo tanto ya corrió el decorador
`@WebSocketGateway`) ANTES de que el propio decorador `@Module` de
`AppModule` se ejecute — que es lo que realmente invoca
`ConfigModule.forRoot()`. Usar `ConfigService` (el patrón que usa el resto
del proyecto) simplemente no funcionaría acá: en el momento en que se
necesita el valor, el módulo de configuración todavía no existe.

Por eso `resolveWebSocketCorsOrigin()` lee `process.env` directamente, con
una consecuencia real documentada explícitamente en el código y en
`.env.example`: en producción, `CORS_ORIGIN`/`NODE_ENV` deben venir de la
plataforma de hosting real (variable de entorno del proceso), NO del
archivo `.env` cargado por `dotenv`/`ConfigModule` — eso pasa demasiado
tarde para este caso puntual. En desarrollo esto no importa (siempre
permisivo).

## Verificación

Script real (`bun`, sin mocks — llama la función real con
`process.env` real mutado): 4/4 casos — sin `NODE_ENV` (dev implícito) y
con `NODE_ENV=development` dan `true`; `NODE_ENV=production` sin
`CORS_ORIGIN` da `false` (nunca `"*"`); `NODE_ENV=production` con
`CORS_ORIGIN="https://app.tudominio.com, https://tudominio.com"` da el
array real, separado y recortado. `typecheck`/`lint`/`build` del backend
completo limpios.

## El otro punto de seguridad pendiente: bloqueado, no por código

Se investigó activar "Leaked Password Protection" de Supabase Auth (el otro
hallazgo de seguridad de ADR-0036/`get_advisors`, tipo `security`) contra el
proyecto real. Confirmado con la documentación oficial real de Supabase
(`search_docs`): esa función **requiere el plan Pro o superior** de
Supabase. Verificado con `get_organization` contra la organización real
("Grupo-neggo"): el plan actual es **`free`** — la función no está
disponible para activar todavía, ni por dashboard ni por ninguna API, hasta
que se actualice el plan (decisión de facturación real, fuera de lo que
puedo hacer yo — necesita que el fundador la autorice y la ejecute él
mismo). Documentado como pendiente real, no como resuelto.

## Referencias

- `docs/decisions/ADR-0036-websocket-rate-limiting-gap.md` (donde se documentó originalmente este hallazgo menor)
- `docs/decisions/ADR-0039-emergency-vehicles-db-hardening.md` (mismo bloque de Fase 8, mismo día)
- `backend/src/common/websocket/websocket-cors.ts` (nuevo)
- `backend/src/modules/location/location.gateway.ts`, `backend/src/modules/assistant/assistant-voice.gateway.ts`
- `backend/.env.example`
- https://supabase.com/docs/guides/auth/password-security (confirma el requisito de plan Pro)
