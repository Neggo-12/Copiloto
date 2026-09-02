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
