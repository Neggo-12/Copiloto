# CURRENT_ARCHITECTURE.md

Generado por auditoría inicial (2026-08-18), según `PROMPT_MAESTRO_CLAUDE_CODE.md` §4 y §35.
Refleja el estado real del repositorio, no el estado deseado.

## 1. Qué existe realmente

El repositorio tiene **un frontend real y funcional**, cero backend, y documentación de
producto/arquitectura extensa. No hay confusión posible: todo lo que sigue está verificado
inspeccionando archivos, no asumido.

```
Copiloto/
├── CLAUDE.md                        # reglas globales
├── PROMPT_MAESTRO_CLAUDE_CODE.md    # este prompt maestro
├── .claude/skills/puntos-movilidad-engineering/   # Skill del proyecto
├── docs/                            # documentación por dominio
├── Imagenes de vista/               # capturas de pantalla del front-end
└── proyecto-mensajeria/             # ← el frontend real (export de Lovable)
```

## 2. Frontend (`proyecto-mensajeria/`)

**Framework:** TanStack Start (Vite + TanStack Router con rutas tipadas por archivo) +
React 19 + TypeScript estricto + Tailwind CSS 4.
**UI:** shadcn/ui sobre primitivos Radix, iconos Phosphor + lucide-react.
**Gestor de paquetes:** el proyecto trae `bun.lock`, pero esta máquina solo tiene
`node`/`npm` instalados (no `bun`). Ver `TECHNICAL_DEBT.md`.
**Origen:** exportado desde Lovable (`AGENTS.md` con banner de Lovable) — trae además su
propio subrepo `.workspace/.git` con las skills internas de Lovable
(`premium-ui-design`, `secure-rbac-routing`, `colombian-compliance-data`,
`pre-build-plan`). Eso es tooling de Lovable, no de Claude Code; no requiere acción.

### 2.1 Estado global

`src/store/AppStore.tsx` — Context + hooks de React (sin Redux/Zustand pese a que
`.workspace/AGENTS.md` lo sugiere como opción). Maneja tema claro/oscuro, flujo de
onboarding (`OnboardingStep`), permisos nativos simulados y el usuario actual.

### 2.2 Capa de dominio (`src/lib/domain/`)

- `types.ts`: modelo canónico completo y ya tipado para el backend real —
  `UserProfile`, `Chat`, `Message`, `MessageAttachment`, `MessageReaction`,
  `StatusUpdate`, `Note` (con `isTask`/`taskStatus`), `Contact`, `ConnectedDevice`,
  `PrivacySettings`, `NotificationSettings`, `SecuritySettings`. Comentario explícito en
  el archivo: **"estos nombres y estructuras se reutilizarán al conectar el backend
  real... NO deben renombrarse a la ligera"**.
- `mock-data.ts` (535 líneas): todos los datos simulados de la app.
- `countries.ts`: catálogo de países/códigos telefónicos.

### 2.3 Acciones aisladas (`src/lib/actions/`)

Un archivo por dominio, cada función pura que transforma estado — el patrón exacto que
se pidió durante la construcción del front-end para que la voz pueda invocarlas más
adelante sin tocar la UI: `auth.ts`, `chats.ts`, `contacts.ts`, `device.ts`, `groups.ts`,
`notes.ts`, `permissions.ts`, `profile.ts`, `status.ts`.

### 2.4 Hooks (`src/hooks/`)

Un hook por pestaña que envuelve las acciones con `useState`/`useCallback` y expone la
API que consume la UI: `useChats`, `useContacts`, `useDevice`, `useNotes`, `useProfile`,
`useStatuses`, más `useSwipeBack` y `use-mobile`. Comentario en `useChats.ts` confirma la
intención de diseño: **"al conectar el backend real solo cambia la implementación
interna, no las firmas usadas por la UI (ni por los futuros comandos de voz)"**.

### 2.5 Pantallas (`src/components/`)

- `onboarding/`: Welcome, Phone, Otp, Email, Profile, Permissions (6 pasos).
- `chats/`: lista, hilo, burbujas, composer, grabador de voz, reacciones, mensajes que
  desaparecen, grupos, reenvío/respuesta, swipe actions.
- `notes/`: libreta con tareas (pendiente/cumplida), editor con texto o nota de voz.
- `contacts/`: lista, alta manual, detalle.
- `profile/`: perfil, seguridad (2FA + dispositivos), privacidad, notificaciones,
  dispositivo/casco emparejado (Bluetooth simulado).
- `status/`: estados/historias tipo WhatsApp con audiencia configurable.
- `shared/`: `DetailScreen` (patrón de navegación con back + swipe-back), `TabBar`,
  `Avatar`, `BottomSheet`, `ConfirmSheet`, `OtpInput`, `VoiceRecorder`, etc.

### 2.6 Enrutamiento

`src/routes/` solo tiene `index.tsx` y `__root.tsx` — la navegación entre pestañas y
pantallas ocurre por estado de React (no por rutas de TanStack Router todavía). Esto es
relevante: **no hay deep-linking real ni historial de navegador nativo** — ver
`MISSING_CAPABILITIES.md`.

## 3. Backend

**Actualizado 2026-08-18 (tarde):** el esquema real ya está aplicado sobre el proyecto
Supabase "Copiloto" (`wrkuusacwkdazfwynhkz`, `ca-central-1`) — 13 tablas, todas con RLS
habilitado, 4 funciones helper de RLS, 4 buckets de Storage con políticas. Ver
`docs/decisions/ADR-0001-esquema-backend.md` para los ajustes hechos sobre el borrador
original y `supabase/migrations/` para el SQL exacto aplicado (mismos nombres/versión
que devuelve `mcp__Supabase__list_migrations`).

Lo que **todavía no existe**: ningún servicio NestJS, ningún cliente API en el
front-end (`proyecto-mensajeria/` sigue 100% en mock-data, sin `@supabase/supabase-js`
instalado ni variables de entorno de conexión), Auth sin proveedor de SMS configurado,
y sin las vistas de `unreadCount`/`lastMessagePreview` que quedaron pendientes en el
ADR. Es decir: hay base de datos real y segura, pero cero conexión desde la app
todavía.

## 4. Lo que NO se puede verificar desde aquí

Este entorno (bridge a la máquina del usuario) ejecuta comandos con un límite de ~45s
por llamada, insuficiente para `npm install` de un proyecto con ~40 dependencias más
`node_modules`. No se instalaron dependencias ni se corrió `lint`/`build` en esta
auditoría. Para completarlo, ejecutar en una terminal real dentro de
`proyecto-mensajeria/`:

```bash
npm install
npm run lint
npm run build
```

No hay script `test` ni `typecheck` definido en `package.json` todavía (ver
`TECHNICAL_DEBT.md`).
