# Imagen real para desplegar el frontend (proyecto-mensajeria) en Railway,
# unificado en el mismo lugar que el backend (ADR-0041) — ver ADR-0042.
# Igual que el backend, Railpack no detecta Bun solo (docs.railway.com/guides/bun),
# así que este Dockerfile es explícito.
#
# Esta app usa TanStack Start sobre Nitro (`@lovable.dev/vite-tanstack-config`).
# Nitro, cuando no se le fija preset, apunta a Cloudflare (el pipeline propio
# de Lovable) — pero respeta la variable de entorno NITRO_PRESET si está
# presente ("still wins", según el propio .d.ts del paquete), así que fijarla
# a `node-server` en el build SOLO afecta esta imagen de Docker, no el publish
# de Lovable (que sigue usando su propio preset interno sin tocar esta var).
#
# Verificado real contra este repo (2026-09-02): `NITRO_PRESET=node-server
# bun run build` genera `.output/server/index.mjs` que arranca de verdad con
# `bun .output/server/index.mjs` y responde HTTP 200 con HTML real en `/`
# (smoke test local confirmado, no simulado). El build de Nitro con preset
# node-server empaqueta sus propias dependencias de runtime dentro de
# `.output/server/node_modules` (verificado: solo `tslib`, ~48K) — por eso
# la etapa final NO necesita `bun install`, solo copiar `.output/`.
#
# Nitro escucha en HOST/PORT. Por defecto HOST es `localhost` (no acepta
# conexiones externas) — Railway necesita `HOST=0.0.0.0` explícito, fijado
# abajo en la etapa de runtime. Railway inyecta PORT real en runtime.
#
# VITE_* son variables de BUILD, no de runtime: Vite las "hornea" dentro del
# bundle en el momento de `bun run build` (import.meta.env), no se leen
# después con la app ya corriendo. Verificado real contra la documentación
# oficial de Railway (docs.railway.com/builds/dockerfiles, 2026-09-02):
# Railway SÍ pasa las variables del servicio al build de Docker, pero SOLO
# las que el propio Dockerfile declara con `ARG` — sin esto, el build corre
# con esos valores vacíos, la app queda compilada apuntando a Supabase con
# credenciales vacías, y falla con 500 en cada request real (encontrado y
# confirmado así, con el deploy real de Railway devolviendo 500).
#
# VITE_SHADOW_EMAIL_BASE (2026-09-02, piloto sin SMS — ver
# src/lib/actions/auth.ts): OBLIGATORIA. Sin declararla aquí como ARG, el
# build la horneará vacía y CADA registro fallará en producción (Supabase
# rechaza el dominio de mentira de respaldo) — a diferencia de
# VITE_SUPABASE_URL/KEY, este gap no da un 500 genérico sino que bloquea el
# registro de cualquier persona real del piloto.

FROM oven/bun:1-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_BACKEND_URL
ARG VITE_SHADOW_EMAIL_BASE
ENV NITRO_PRESET=node-server
RUN bun run build

FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
COPY --from=builder /app/.output ./.output
EXPOSE 3000
CMD ["bun", ".output/server/index.mjs"]
