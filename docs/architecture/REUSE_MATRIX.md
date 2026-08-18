# REUSE_MATRIX.md

Clasificación por componente según `PROMPT_MAESTRO_CLAUDE_CODE.md` §3-4: `KEEP`,
`EXTEND`, `REFACTOR`, `REPLACE`, `REMOVE`. Regla aplicada: `REUSE > EXTEND > REFACTOR >
REPLACE`. Ningún componente se marcó `REPLACE`/`REMOVE` sin razón técnica explícita.

| Componente | Estado | Decisión | Razón |
|---|---|---|---|
| `src/lib/domain/types.ts` | Modelo de datos completo y tipado | **KEEP** | Ya nombrado pensando en el backend real; el propio archivo lo advierte. Extender solo si falta un campo, nunca renombrar sin ADR. |
| `src/lib/domain/mock-data.ts` | Datos simulados | **KEEP** (por ahora) | Se retira gradualmente conforme cada hook se conecte al backend real; no se borra de un solo golpe (rompería pantallas aún no migradas). |
| `src/lib/actions/*.ts` | Lógica aislada por dominio | **EXTEND** | Patrón correcto para exponer como *tools* de voz. Extender con validación/errores reales al conectar backend; no reescribir. |
| `src/hooks/use*.ts` | Wrappers de estado por pestaña | **EXTEND** | Cambiar la implementación interna (mock → fetch/WS real) manteniendo la firma pública, tal como indica el comentario en `useChats.ts`. |
| `src/store/AppStore.tsx` | Estado global (Context) | **EXTEND** | Server bien para MVP; si crece mucho, evaluar Zustand (ya sugerido en `.workspace/AGENTS.md` de Lovable) — decisión futura, no ahora. |
| `src/components/**` (pantallas) | UI completa Fase 1+2 | **KEEP / EXTEND** | No reconstruir. Extender pantallas existentes para nuevas capacidades (voz, mapas) en vez de crear pantallas paralelas. |
| `src/components/shared/DetailScreen.tsx` | Patrón de navegación con back+swipe | **KEEP** | Reutilizar para toda pantalla secundaria nueva (Modo conducción, Emergency, etc.). |
| `src/routes/` (solo `index.tsx`/`__root.tsx`) | Routing real casi vacío | **REFACTOR** | Falta enrutamiento real de TanStack Router para navegación por URL/deep-link; hoy todo vive en estado de React. Ver `MISSING_CAPABILITIES.md`. |
| `.workspace/` (subrepo Lovable + skills internas) | Metadata de la herramienta Lovable | **KEEP, no tocar** | No es código del producto; es configuración propia de Lovable. No mezclar con `.claude/skills/`. |
| `AGENTS.md` (dentro de `proyecto-mensajeria/`) | Instrucciones de Lovable | **KEEP** | No entra en conflicto con `CLAUDE.md`; ambos pueden coexistir (uno gobierna Lovable, otro gobierna Claude Code). |
| Backend NestJS/PostgreSQL/Redis | No existe código | **CREAR** (no aplica REUSE) | La especificación ya existe en `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md`; construir desde ahí, no desde cero conceptualmente. |
| Asistente de voz | No existe código | **CREAR** | Visión ya documentada en `docs/product/` y `docs/voice/`; falta toda implementación. |
| `docs/architecture/Orden-Frontend-Lovable-CoPiloto.md` | Spec histórica pantalla por pantalla | **KEEP como referencia** | No reescribir; es el registro de decisiones del front-end ya construido. |
