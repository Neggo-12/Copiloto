# TECHNICAL_DEBT.md

Riesgos y deuda detectados en la auditoría inicial (2026-08-18). Ninguno bloquea
empezar a trabajar, pero deben quedar registrados antes de construir encima.

## 1. Gestor de paquetes inconsistente

**Resuelto 2026-08-18 (parcialmente):** el usuario instaló `bun` localmente. Pero el
`bun.lock` original de Lovable resolvía los paquetes contra su **proxy privado**
(`europe-west1-npm.pkg.dev/lovable-core-prod/...`), no contra el registro público de
npm. Eso pasó inadvertido en instalaciones normales (`bun install` cae de vuelta al
registro público si no puede alcanzar el proxy), pero **rompía GitHub Actions** en
segundos con un 403, porque `bun install --frozen-lockfile` sí exige esa URL exacta y
GitHub Actions no tiene acceso a la infraestructura de Lovable. Se regeneró `bun.lock`
desde cero (`rm bun.lock && bun install`) contra el registro público — verificado que
ya no queda ninguna referencia a `npm.pkg.dev`, y que `lint`/`typecheck`/`build` siguen
pasando con las versiones nuevas (dentro de los rangos `^` que ya tenía `package.json`).
Ver `docs/decisions/README.md` (entrada 2026-08-18, CI).

`npm` sigue sin ser la herramienta recomendada para este proyecto (usar siempre `bun`).

## 2. Sin verificación automática ejecutada todavía

Esta auditoría **no pudo ejecutar** `npm install`, `lint`, `typecheck` ni `build` porque
el puente a la máquina del usuario limita cada comando a ~45 segundos, insuficiente para
instalar ~40 dependencias. Comandos pendientes de correr manualmente:

```bash
cd proyecto-mensajeria
npm install   # o: bun install
npm run lint
npm run build
```

No se debe asumir que el proyecto compila limpio hasta confirmar esto.

## 3. Sin script `typecheck` ni suite de tests

`package.json` no define `typecheck` (solo `lint`, `build`, `format`, `dev`, `preview`).
TypeScript estricto está configurado (`tsconfig.json`), pero nada lo corre de forma
aislada y rápida (`tsc --noEmit`). No hay `vitest`/`jest`/`playwright` instalado — cero
tests automatizados. Antes de cerrar cualquier tarea según el DoD de `CLAUDE.md` §13,
esto es una brecha real, no un detalle menor.

## 4. Routing real casi vacío

`src/routes/` solo tiene `index.tsx` y `__root.tsx` pese a usar TanStack Router (que
soporta rutas tipadas por archivo). La navegación entre pantallas ocurre hoy por estado
de React, no por URL. Esto significa: sin deep-linking, sin "volver" nativo del
navegador, sin compartir un link a una pantalla concreta. No es un bloqueo para el MVP,
pero si se integra voz con comandos tipo "abre el chat de Carlos", convendría que eso
resuelva a una URL real, no solo a estado en memoria.

## 5. Dos sistemas de "skills" coexistiendo sin conflicto pero sin relación

`proyecto-mensajeria/.workspace/skills/` (skills internas de Lovable: `premium-ui-design`,
`secure-rbac-routing`, `colombian-compliance-data`, `pre-build-plan`) y
`.claude/skills/puntos-movilidad-engineering/` (la Skill de este proyecto) son sistemas
distintos de herramientas distintas. No hay que fusionarlos ni que uno lea al otro; se
deja constancia para que no se confundan en una auditoría futura.

## 6. Historial de git no refleja la reorganización de documentos como "mover"

El único commit existente (`chore: primer commit — documentación y assets de CoPiloto`)
es anterior a la reorganización de `CLAUDE.md`/Skill/`docs/`. `git status` ve los
archivos movidos (`Ficha-04-CoPiloto.md`, `Orden-Frontend-Lovable-CoPiloto.md`,
`Especificacion-Backend-Supabase-CoPiloto.md`) como "deleted" en su ubicación vieja y
"untracked" en la nueva, en vez de como un rename. No afecta el contenido, pero conviene
que el usuario revise `git status` y decida cuándo y cómo commitear (no se hizo commit
automáticamente en esta sesión).

## 7. Decisiones de producto aún abiertas (bloquean, no técnicamente, pero sí en secuencia)

- Proveedor de SMS/OTP.
- Protección de propiedad intelectual/patente — marcada como prioridad, sin resolver;
  no debería seguir escalándose visibilidad pública del producto sin esto claro.

~~Confirmación de que el proyecto Supabase real ya fue creado por el usuario.~~
**Resuelto 2026-08-18:** el proyecto "Copiloto" (`wrkuusacwkdazfwynhkz`,
`ca-central-1`) ya existe, está `ACTIVE_HEALTHY`, y desde esa misma tarde tiene el
esquema completo aplicado (13 tablas + RLS + storage). Ver
`docs/decisions/ADR-0001-esquema-backend.md`.

## 8. Riesgo residual aceptado en las funciones helper de RLS

`is_chat_participant`, `is_chat_admin`, `is_contact_of` y `can_view_status` son
`security definer` y el advisor de seguridad de Supabase las marca (WARN) como
ejecutables por `authenticated` vía RPC directo. Se revocó `EXECUTE` de `anon`/`public`
(un usuario sin sesión no puede llamarlas). Un usuario ya autenticado sí podría invocar,
por ejemplo, `is_chat_participant('<uuid-ajeno>')` para confirmar si pertenece a un chat
cuyo ID no conocía — un "oráculo de existencia" de bajo riesgo real porque los IDs son
UUID v4 no enumerables, pero no es cero. Es el patrón estándar de Supabase para este
tipo de función (se necesita `EXECUTE` de `authenticated` para que las políticas RLS del
propio usuario se evalúen); se documenta como aceptado, no se persigue más por ahora.

## 9. Pendiente visual: favicon/logo por defecto de Lovable

Confirmado (2026-08-18) y en cola para "más adelante" por pedido del fundador — no se
toca todavía: `proyecto-mensajeria/public/favicon.ico` es el ícono por defecto que trae
Lovable (un corazón con gradiente naranja→azul), no un ícono propio de Copiloto. Es lo
que aparece en la pestaña del navegador al abrir la app. Revisado el resto del código
(componentes, `vite.config.ts`, el paquete `@lovable.dev/vite-tanstack-config`): no hay
ningún otro logo o watermark de Lovable inyectado en la UI — solo el favicon. Para
quitarlo hace falta un ícono real de Copiloto (256×256, `.ico` o `.png`); en cuanto se
tenga el diseño de marca, se reemplaza ese único archivo.

## 10. Almacenamiento de sesión de Auth: en memoria (temporal, a propósito)

**2026-08-18.** `src/lib/supabase/client.ts` guarda la sesión de Supabase Auth en un
adapter **en memoria**, no en `localStorage`. Motivo: la regla de seguridad del
fundador prohíbe `localStorage` para datos sensibles, y el plan a largo plazo
(`@capacitor/preferences`, almacenamiento nativo seguro) **también cae a
`localStorage` en la web** hasta que la app se empaquete de verdad con Capacitor — es
decir, usarlo hoy no resolvería el problema, solo lo escondería. Costo aceptado: la
sesión no sobrevive a un refresh de página durante esta fase de pruebas (hay que
volver a pedir el OTP). Reemplazar por `@capacitor/preferences` en cuanto exista el
empaquetado nativo real — ver `docs/decisions/README.md`.

## 11. `completeOnboarding()` sin UI de error

**2026-08-18.** `completeOnboarding()` en `AppStore.tsx` ahora es async y puede
fallar (sin sesión activa, error de Postgres al guardar `profiles`, etc.). Por ahora
el único manejo es un `console.error` en `src/routes/index.tsx` — no hay pantalla ni
mensaje visible para el usuario si falla. Aceptado como corte de alcance de esta
iteración (el flujo feliz con Test OTP funciona de punta a punta); pendiente antes de
producción.
