# Imagen real para desplegar el backend en Railway (ADR-0041). Railpack (el
# builder automático de Railway) todavía NO detecta proyectos Bun solo — la
# documentación oficial de Railway (docs.railway.com/guides/bun) es explícita
# en esto: hace falta un Dockerfile propio. Este usa la imagen oficial de Bun
# (`oven/bun`), no Node — el proyecto entero (lockfile `bun.lock`, scripts
# `bun run ...` en todos los ADR de este repo desde ADR-0018) ya asume Bun
# como runtime real, así que usar Node acá sería inconsistente sin motivo.
#
# Build de dos etapas: la primera instala TODAS las dependencias (incluye
# `@nestjs/cli`/`typescript`, necesarias solo para compilar) y corre
# `nest build`; la segunda arranca de una imagen limpia, instala SOLO
# dependencias de producción, y copia el `dist/` ya compilado — la imagen
# final no carga el toolchain de build, solo lo que corre en producción.
# Verificado real contra este repo (2026-09-02): `bun install --frozen-lockfile`
# y `bun run build` corridos localmente contra el `bun.lock` real de este
# proyecto, y `bun dist/main.js` arranca de verdad (Nest bootstrapea y llega
# a `validateEnv`; falla ahí SOLO porque este smoke test no tenía
# SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/REDIS_URL reales configuradas —
# comportamiento esperado y correcto, confirma que el artefacto compilado
# funciona, no que esté roto).

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

# Railway inyecta su propia PORT real en runtime — `main.ts` ya la lee vía
# `ConfigService` (`config.get("PORT")`), este EXPOSE es solo documentación,
# no fija el puerto real.
EXPOSE 3001

CMD ["bun", "dist/main.js"]
