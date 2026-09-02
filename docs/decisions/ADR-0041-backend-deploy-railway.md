# ADR-0041: Despliegue real del backend — Railway + Dockerfile (preparación del piloto)

- Fecha: 2026-09-02
- Estado: **preparado, no desplegado todavía** — falta que el fundador cree la cuenta/proyecto real en Railway (acción de cuenta/facturación, no la puedo ejecutar yo).

## Contexto

Primer bloqueo real, no de código, para arrancar la Etapa 1 del piloto de la
Fase 8 ("1 ambulancia simulada + 5–10 conductores", `05_CRONOGRAMA...md`):
el backend NestJS **solo corre en local/este sandbox** — no hay ningún
despliegue real, y sin un backend alcanzable por internet, ningún teléfono
real (los 5–10 conductores) puede conectarse. El motor de simulación
(`SimulationModule`, ADR-0022 en adelante) ya prueba el pipeline real contra
Redis real — eso valida la LÓGICA del corredor, no reemplaza tener el
backend corriendo en algún lado real para gente real.

## Decisión: Railway

Evalué Railway/Render/Fly.io (documentación oficial real de cada uno). Elegí
**Railway** por evidencia concreta para este caso puntual:

- Soporta WebSockets de forma nativa detrás de su proxy (`LocationGateway`/
  `AssistantVoiceGateway` los necesitan de verdad).
- Sigue leyendo `PORT` como variable de entorno inyectada — este backend ya
  la lee así (`main.ts` → `ConfigService.get("PORT")`), cero cambios de
  código.
- Deploy desde GitHub con push automático — encaja con el flujo real del
  proyecto (el fundador ya hace `git push` a mano tras cada ADR).
- Tiene un plan de prueba/trial suficiente para validar un piloto corto de
  5–10 personas antes de comprometerse a un plan pago — apropiado para
  "validar antes de escalar", que es literalmente el criterio de salida de
  la Fase 8.

No elegí Render/Fly.io por preferencia — son alternativas razonables, pero
Railway no tenía ninguna desventaja real encontrada para este caso y sí una
ventaja concreta (mejor documentación real encontrada para Bun).

## Lo que preparé (código, verificado real)

Verificado en la documentación oficial real de Railway
(`docs.railway.com/guides/bun`) ANTES de escribir nada: **Railpack (el
detector automático de Railway) todavía NO reconoce proyectos Bun solo** —
hace falta un `Dockerfile` propio. Este proyecto usa Bun de verdad (`bun.lock`,
todos los scripts de verificación desde ADR-0018 corren con `bun run`), así
que la imagen usa `oven/bun:1-alpine`, no Node.

Nuevo `backend/Dockerfile` (dos etapas — build con todas las dependencias,
runtime solo con las de producción):

```
FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["bun", "dist/main.js"]
```

Más `backend/.dockerignore` (excluye `node_modules`, `dist`, `.env*`, `.git`)
y un script nuevo `start:prod` (`bun dist/main.js`) en `package.json`, para
que correr en producción sea explícito y no solo algo que vive dentro del
`CMD` del Dockerfile.

## Verificación real (sin Docker daemon disponible en este sandbox)

Docker CLI está instalado en este sandbox pero el daemon no puede arrancar
acá (entorno sin privilegios para eso — limitación real del sandbox, no del
proyecto). En vez de simular el build, verifiqué cada paso real del
Dockerfile directamente con `bun` (mismo binario, misma imagen base
`oven/bun:1-alpine` en versión mayor 1.x que la instalada aquí, 1.3.13):

1. `bun install --frozen-lockfile` → "Checked 497 installs across 483
   packages (no changes)" — confirma que el `bun.lock` real del repo está
   sincronizado con `package.json` (si no lo estuviera, este paso fallaría
   el build real en Railway).
2. `bun run build` (`nest build`) → genera `dist/main.js` real.
3. `bun dist/main.js` → el Nest real arranca, llega hasta
   `ConfigModule.forRoot()` → `validateEnv()`, y falla ahí EXACTAMENTE como
   se espera (este sandbox no tiene `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/
   `REDIS_URL` reales configuradas) — confirma que el artefacto compilado es
   válido y ejecutable bajo Bun, no que esté roto.

El build del **contenedor** en sí (la imagen Docker completa) lo verificará
Railway al desplegar de verdad — es el paso que falta y que requiere que el
fundador cree el proyecto en Railway (cuenta/facturación, fuera de lo que
puedo ejecutar yo).

## Lo que falta — acciones reales del fundador (no de código)

1. Crear cuenta/proyecto en Railway (railway.com) y conectar el repo de
   GitHub — Railway detecta el `Dockerfile` en `backend/` automáticamente
   (hay que fijar el "root directory" del servicio en `backend/` si Railway
   no lo detecta solo, porque el repo es un monorepo).
2. Configurar las variables de entorno reales en el dashboard de Railway
   (nunca pegarlas en este chat — mismo criterio de siempre):
   - `NODE_ENV=production`
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard →
     Project Settings → API, proyecto "Copiloto")
   - `REDIS_URL` (Upstash, connection string `rediss://` real — ADR-0008)
   - `CORS_ORIGIN` (ADR-0040) — el dominio real donde quede publicado
     `proyecto-mensajeria` (ver siguiente punto)
   - Opcionales si ya están listas: `GOOGLE_MAPS_API_KEY`,
     `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT`,
     `GEMINI_API_KEY`, `ADMIN_USER_ID`
3. Una vez desplegado, Railway da una URL real (`https://....up.railway.app`
   o un dominio propio) — esa URL es la que va en `VITE_BACKEND_URL` del
   lado de `proyecto-mensajeria`.

## Hallazgo real sobre el frontend (`proyecto-mensajeria/`)

Auditando `vite.config.ts` de `proyecto-mensajeria/` para saber si el
frontend ya tenía dónde vivir: usa
`@lovable.dev/vite-tanstack-config`, que trae Nitro configurado con
**Cloudflare como target de build por defecto** — evidencia real de que este
proyecto se publica normalmente desde el propio editor de Lovable (botón
"Publish"), no desde este repo/sesión. Esto confirma lo que el fundador
recordaba: el proyecto nació ahí y se sigue publicando por ese canal.
Consistente también con `.gitignore` (`proyecto-mensajeria/.workspace/` está
excluido explícitamente por ser "metadata interna de Lovable — es un repo
git propio anidado").

No pude confirmar si ya existe una URL publicada real (no tengo acceso al
dashboard de Lovable) — esto se lo pregunté directamente al fundador en el
chat en vez de adivinarlo.

## Referencias

- https://docs.railway.com/guides/bun (requisito real de Dockerfile para Bun)
- https://docs.railway.com/guides/nest
- `docs/decisions/ADR-0040-websocket-cors-hardening.md` (`CORS_ORIGIN` depende de esta URL)
- `docs/decisions/ADR-0022-simulation-engine-first-slice.md` (motor de simulación, ya verificado real)
- `backend/Dockerfile`, `backend/.dockerignore`, `backend/package.json` (`start:prod`)
