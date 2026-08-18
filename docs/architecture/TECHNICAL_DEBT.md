# TECHNICAL_DEBT.md

Riesgos y deuda detectados en la auditoría inicial (2026-08-18). Ninguno bloquea
empezar a trabajar, pero deben quedar registrados antes de construir encima.

## 1. Gestor de paquetes inconsistente

`proyecto-mensajeria/` trae `bun.lock` (Lovable usa Bun), pero la máquina donde vive el
repo solo tiene `node`/`npm` instalados, sin `bun`. Instalar con `npm install` puede
resolver versiones ligeramente distintas a las que Lovable probó. Recomendación: instalar
`bun` localmente (`curl -fsSL https://bun.sh/install | bash`) para reproducir exactamente
el entorno de Lovable, o aceptar `npm` y regenerar `package-lock.json` de forma
consciente (decisión a documentar en un ADR si se toma).

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
