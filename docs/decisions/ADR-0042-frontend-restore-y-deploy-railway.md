# ADR-0042: Corrección de un hallazgo falso + Dockerfile real para desplegar `proyecto-mensajeria/` en Railway

- Fecha: 2026-09-02
- Estado: **desplegado real en Railway y verificado en un navegador real** (`https://disciplined-ambition-production-b2c4.up.railway.app`). Falta solo un paso real de configuración: fijar `CORS_ORIGIN` en el servicio del backend con esta URL (ADR-0040).

## Contexto — y una autocorrección real

El fundador pidió unificar el hosting: "unifiquemos todo en uno solo... no
me interesa separarlo". Antes de escribir este ADR había investigado un
supuesto problema real: al correr `bun run build`/`bun run dev` sobre la
copia de `proyecto-mensajeria/` que tenía en este sandbox
(`/mnt/user-data/uploads/Copiloto/`, un upload de este mismo chat, sin
`.git`), fallaba con `rootRouteNode must not be undefined... src/routes/__root.tsx`,
y al comparar esa copia contra un zip re-exportado de Lovable "faltaban" 101
archivos.

El fundador cuestionó ese hallazgo ("revisa bien... no perdamos tokens").
Verifiqué el error dos veces (build y dev) y siendo honesto, insistí en que
era real — **pero verifiqué contra la copia equivocada**. Nunca comparé
contra el repositorio real en su Mac, solo contra un upload de este chat que
había quedado desactualizado frente al trabajo real ya hecho ahí.

## La corrección real, esta vez sí contra el repo del Mac

Con el Mac conectado a esta sesión, listé el árbol real de
`/Users/usuario/Documents/GitHub/Copiloto/proyecto-mensajeria/src/` con las
herramientas del puente (`device_list_dir`, recursivo) y comparé contra lo
que yo tenía. Resultado real, sin ambigüedad:

- El repo real del Mac **ya tiene los 146 archivos completos** —
  `src/routes/__root.tsx` incluido, con fecha de modificación real
  (`mtimeMs`) consistente con trabajo ya hecho en sesiones anteriores.
- `src/lib/domain/mock-data.ts` **ya tenía** `export let CURRENT_USER_ID` +
  `setCurrentUserId()` — exactamente lo que yo creía haber "corregido" en mi
  copia vieja.
- `src/routes/index.tsx` **ya tenía** la llamada real y correcta a
  `startChatWithUser(contact.linkedUserId, contact.displayName, contact.avatarUrl)`
  — versión async de verdad conectada a Supabase (`findOrCreateIndividualChat`
  real), más completa que la que yo pensaba que había que "arreglar".
- **`src/components/notes/` ya no existe en el repo real** — fue
  reemplazado por `src/components/reminders/` (la feature real de
  Recordatorios por ubicación, Fase 7 del cronograma). Mi copia vieja del
  sandbox todavía tenía el "Notes" mock original de la plantilla de Lovable,
  ya reemplazado hace tiempo en el repo real. Restaurar `NoteEditorScreen.tsx`
  desde el zip viejo de Lovable habría sido un retroceso real, no una
  corrección.

**Descarté por completo el trabajo de "restauración de 101 archivos" y las
4 "correcciones" de esta sesión — ninguna aplica al repo real.** No se
sincronizará nada de eso al Mac. El error que reproduje sí era real, pero
solo existía en mi copia local desactualizada de este chat, nunca en el
código real del fundador.

## Verificación real, esta vez contra el contenido real del Mac

Traje el árbol completo real (`src/`, `public/`, `package.json`, `bun.lock`,
`vite.config.ts`, etc.) al sandbox vía el puente de dispositivo
(`device_stage_files`, 146 archivos de `src/` en lotes), instalé con
`bun install --frozen-lockfile` (422 paquetes, lockfile real sincronizado) y
corrí las mismas verificaciones reales que en el resto de este proyecto:

1. `NITRO_PRESET=node-server bun run build` → build limpio, genera
   `.output/server/index.mjs` real.
2. `bun run typecheck` (`tsc --noEmit`) → limpio, cero errores.
3. **Smoke test real del servidor**: `HOST=0.0.0.0 PORT=8100 bun
   .output/server/index.mjs`, `curl` real contra `http://127.0.0.1:8100/` →
   `HTTP_STATUS:200` con HTML real de la app.
4. `bun run lint` → 1384 errores reales, 100% `prettier/prettier` (formato
   puro). **Hallazgo real pero preexistente, no causado por este cambio y NO
   corregido acá** — no forma parte del objetivo de este ADR (desplegar el
   frontend) y corregirlo tocaría decenas de archivos sin relación con el
   Dockerfile; queda documentado como pendiente para cuando se decida
   encararlo explícitamente.

Confirmado: el repo real del fundador ya compila y typechequea limpio sin
ningún cambio de código. Lo único que genuinamente faltaba era el
`Dockerfile`/`.dockerignore` — ninguno de los dos existía en la raíz de
`proyecto-mensajeria/` en el Mac.

## Nuevo: `proyecto-mensajeria/Dockerfile` + `.dockerignore`

Mismo criterio que ADR-0041 (Railpack no detecta Bun solo,
`docs.railway.com/guides/bun`). El build de Nitro con preset `node-server`
empaqueta sus propias dependencias de runtime dentro de
`.output/server/node_modules` (verificado: solo `tslib`, ~48 KB) — la etapa
final NO necesita `bun install`, solo copiar `.output/`, más simple que el
Dockerfile del backend.

```
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
```

`NITRO_PRESET=node-server` solo afecta esta imagen de Docker — Nitro respeta
esa variable de entorno cuando está presente ("still wins", según el propio
`.d.ts` de `@lovable.dev/vite-tanstack-config`), y el pipeline de publish
propio de Lovable usa su preset interno (`LOVABLE_NITRO_PRESET`, Cloudflare)
sin depender de esta variable — cero riesgo de romper ese canal.

`HOST=0.0.0.0` es obligatorio: Nitro por defecto solo escucha en `localhost`,
lo que rechazaría cualquier conexión externa en Railway.

El build del **contenedor** en sí (imagen Docker completa) lo verificará
Railway al desplegar — sin daemon de Docker disponible en este sandbox,
misma limitación real que en ADR-0041.

## Lección real para esta sesión

Cuando este sandbox tiene una copia local de un repo que el fundador
también tiene en su propia máquina, **la copia local puede quedar
desactualizada silenciosamente** (uploads de chats anteriores, sesiones
distintas) sin que nada lo señale — ni la fecha de modificación, ni que el
error se reproduzca de forma consistente, son prueba de que el problema es
real en el repo del fundador. La única verificación real es comparar
directamente contra el dispositivo conectado antes de reportar un hallazgo
como bloqueante, cuando el puente a la Mac está disponible.

## Lo que falta — acciones reales del fundador (no de código)

1. En el mismo proyecto de Railway del backend (ADR-0041), crear un
   **segundo servicio** apuntando al mismo repo de GitHub, con "Root
   Directory" = `proyecto-mensajeria` (mismo patrón monorepo ya usado con el
   backend) — Railway detectará el `Dockerfile` automáticamente.
2. Variables de entorno reales en el dashboard de ese servicio:
   - `VITE_SUPABASE_URL` = `https://wrkuusacwkdazfwynhkz.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (Supabase Dashboard → API Keys,
     la `sb_publishable_...`, no la secreta)
   - `VITE_BACKEND_URL` = `https://copiloto-production-b047.up.railway.app`
     (backend real ya en línea, ADR-0041)
3. Generar dominio público (Settings → Networking → Public Networking →
   "Generate Domain"), igual que se hizo con el backend.
4. Con la URL real del frontend ya generada, volver al servicio del
   **backend** y fijar `CORS_ORIGIN` (ADR-0040) a esa URL — pendiente
   explícito que quedaba abierto desde ADR-0041.

## Resultado real del despliegue — dos bugs reales encontrados y corregidos en producción

Con el Dockerfile ya en Railway, el despliegue real reveló dos problemas que
ningún build/typecheck/lint local podía haber mostrado (son de
configuración de infraestructura, no de código):

1. **502 real**: el dominio público HTTP quedó apuntando al puerto por
   defecto de Railway (`8080`) mientras la app real escuchaba en `3000`
   (confirmado con el log real de arranque: `Listening on: http://localhost:3000/`).
   Un "3000" que se había puesto antes terminó configurando el **TCP Proxy**
   (una feature aparte), no el dominio HTTP. Corregido editando el puerto
   del dominio HTTP a `3000` en Settings → Networking.
2. **500 real** (tras corregir el 502): confirmado contra la documentación
   oficial de Railway (`docs.railway.com/builds/dockerfiles`) que **Railway
   solo pasa las variables del servicio al build de Docker si el Dockerfile
   las declara con `ARG`** — sin eso, `bun run build` corría con
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_BACKEND_URL`
   vacías (se "hornean" en el bundle en tiempo de build, no se leen después
   en runtime), y la app quedaba compilada intentando hablar con Supabase
   sin credenciales. Verificado real y reproducido en este sandbox:
   `bun run build` sin esas variables NO deja la URL real de Supabase en
   `.output/`; con las variables sí. Corregido agregando `ARG
   VITE_SUPABASE_URL` / `ARG VITE_SUPABASE_PUBLISHABLE_KEY` / `ARG
   VITE_BACKEND_URL` al stage `builder` del Dockerfile.

Verificación final real: el fundador abrió la URL pública
(`https://disciplined-ambition-production-b2c4.up.railway.app`) en su
navegador real y la app cargó completa (pantalla de bienvenida "Mensajes y
notas, en un solo lugar"), confirmado con captura de pantalla real — no
simulado.

## Pendiente real, deliberadamente no tocado en este cambio

- 1384 errores de formato (`prettier/prettier`) preexistentes en el repo
  real — no bloquean el build ni el despliegue, quedan documentados para
  cuando se decida corregirlos explícitamente (afectan muchos archivos sin
  relación con este cambio).

## Referencias

- `docs/decisions/ADR-0041-backend-deploy-railway.md` (mismo patrón de
  Dockerfile/Railway, ya desplegado y en línea)
- `docs/decisions/ADR-0040-websocket-cors-hardening.md` (`CORS_ORIGIN`
  pendiente de la URL real de este frontend)
- https://docs.railway.com/guides/bun
- `proyecto-mensajeria/Dockerfile`, `proyecto-mensajeria/.dockerignore`
