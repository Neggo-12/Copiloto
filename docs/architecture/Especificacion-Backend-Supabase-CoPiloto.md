# Especificación de Back-end (Supabase) — CoPiloto (nombre provisional)

**Fecha:** 12 de agosto de 2026
**Alcance:** primer borrador del esquema real de base de datos, autenticación y almacenamiento para la app de mensajería, basado en todo lo especificado y construido en `Orden-Frontend-Lovable-CoPiloto.md` (Fase 1 + Fase 2 completas). Este documento se revisa contigo antes de ejecutar ninguna migración real — nada de esto se ha aplicado todavía a un proyecto de Supabase.

**Qué falta para poder ejecutar esto de verdad:**
1. El ID/ref del proyecto de Supabase que vas a crear tú mismo (dentro de tu organización "Neggo-12" o en una nueva, como prefieras) — dedicado solo a CoPiloto, sin mezclarlo con "fiduciaria" ni con el otro proyecto "Neggo-12".
2. El .zip exportado del proyecto de Lovable, subido aquí al chat, para verificar que los nombres de datos que Lovable terminó usando coinciden con este esquema (y ajustar si hay diferencias).
3. Definir el proveedor de SMS para el OTP de verificación de celular (Supabase Auth necesita uno conectado — Twilio, MessageBird o Vonage son las opciones soportadas; hay que evaluar cuál cubre bien números de Colombia a buen costo).

Mientras tanto, este documento avanza el diseño para no perder tiempo.

---

## 1. Autenticación

- **Teléfono (obligatorio, principal):** Supabase Auth con proveedor de SMS (Twilio/MessageBird/Vonage — por definir, punto 3 arriba). Flujo: `signInWithOtp` por teléfono → verificación de código.
- **Correo (verificación secundaria, tal como se pidió en la orden de front-end):** se vincula como identidad adicional sobre la misma cuenta (`auth.users` permite múltiples identidades) con confirmación por enlace u OTP de correo, usando el proveedor de correo integrado de Supabase (o uno propio tipo Resend/Postmark si se quiere más control de entregabilidad).
- **Sesión:** tokens manejados por el SDK de Supabase para apps híbridas/Capacitor, guardados en almacenamiento seguro nativo (Capacitor `Preferences`/Keychain), nunca en `localStorage` — tal como quedó especificado desde el inicio del front-end (§5.1 de la orden de Lovable).
- **Dispositivos conectados (pantalla de Seguridad):** Supabase ya registra sesiones por dispositivo internamente; se expone una vista simplificada al usuario y la opción de revocar una sesión específica (equivalente a "cerrar sesión en este dispositivo").

## 2. Tablas principales

### `profiles`
Extiende `auth.users` (relación 1 a 1 por `id`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK, FK → `auth.users.id` | |
| `phone` | text, único | ya verificado por Auth |
| `email` | text, único, nullable | ya verificado por Auth |
| `display_name` | text | |
| `avatar_url` | text, nullable | referencia a Storage |
| `about` | text, nullable | "acerca de" |
| `last_seen_visibility` | enum(`everyone`,`contacts`,`nobody`) | default `everyone` |
| `photo_visibility` | enum(`everyone`,`contacts`,`nobody`) | |
| `about_visibility` | enum(`everyone`,`contacts`,`nobody`) | |
| `two_factor_enabled` | boolean | default `false` |
| `created_at` / `updated_at` | timestamptz | |

### `contacts`
| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid, FK → `profiles.id` | dueño del contacto |
| `contact_id` | uuid, FK → `profiles.id`, nullable | null si la persona no tiene cuenta todavía (invitado por número) |
| `contact_phone` | text | siempre presente, aunque `contact_id` exista |
| `nickname` | text, nullable | apodo personalizado |
| `created_at` | timestamptz | |
| PK compuesta | (`user_id`, `contact_phone`) | |

### `chats`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `type` | enum(`individual`,`group`) | |
| `name` | text, nullable | solo grupos |
| `photo_url` | text, nullable | solo grupos |
| `disappearing_duration` | interval, nullable | null = desactivado; si no, `24h`/`7d`/`90d` |
| `created_by` | uuid, FK → `profiles.id` | |
| `created_at` | timestamptz | |

### `chat_participants`
| Columna | Tipo | Notas |
|---|---|---|
| `chat_id` | uuid, FK → `chats.id` | |
| `user_id` | uuid, FK → `profiles.id` | |
| `role` | enum(`member`,`admin`) | relevante solo en grupos |
| `is_pinned` | boolean | por usuario, máx. 3 (se valida en la app o con trigger) |
| `is_muted` | boolean | |
| `muted_until` | timestamptz, nullable | null = silenciado "siempre" |
| `is_archived` | boolean | |
| `joined_at` | timestamptz | |
| PK compuesta | (`chat_id`, `user_id`) | |

### `messages`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `chat_id` | uuid, FK → `chats.id` | |
| `sender_id` | uuid, FK → `profiles.id` | |
| `type` | enum(`text`,`voice_note`,`image`,`document`,`location`,`system`) | |
| `content` | text, nullable | texto del mensaje o del sistema |
| `media_url` | text, nullable | Storage: nota de voz, imagen, documento |
| `media_duration_seconds` | int, nullable | notas de voz |
| `reply_to_id` | uuid, FK → `messages.id`, nullable | |
| `forwarded_from_id` | uuid, FK → `messages.id`, nullable | |
| `created_at` | timestamptz | |
| `edited_at` | timestamptz, nullable | |
| `deleted_at` | timestamptz, nullable | soft delete |
| `expires_at` | timestamptz, nullable | calculado al enviar si el chat tiene `disappearing_duration` activo |

Regla de edición/eliminación (ventana de 15 min ya definida en el front-end): se aplica con una política RLS que compara `now() - created_at < interval '15 minutes'`, no solo en el cliente.

### `message_status`
| Columna | Tipo | Notas |
|---|---|---|
| `message_id` | uuid, FK → `messages.id` | |
| `user_id` | uuid, FK → `profiles.id` | destinatario |
| `status` | enum(`delivered`,`read`) | |
| `updated_at` | timestamptz | |
| PK compuesta | (`message_id`, `user_id`) | |

### `message_reactions`
| Columna | Tipo | Notas |
|---|---|---|
| `message_id` | uuid, FK → `messages.id` | |
| `user_id` | uuid, FK → `profiles.id` | |
| `emoji` | text | |
| `created_at` | timestamptz | |
| PK compuesta | (`message_id`, `user_id`) | un usuario, una reacción activa por mensaje |

### `location_shares`
| Columna | Tipo | Notas |
|---|---|---|
| `message_id` | uuid, PK, FK → `messages.id` | |
| `latitude` / `longitude` | double precision | |
| `address_label` | text, nullable | |
| `is_live` | boolean | |
| `live_duration_minutes` | int, nullable | 15/60/480 |
| `live_expires_at` | timestamptz, nullable | |
| `stopped_at` | timestamptz, nullable | |

### `notes`
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `profiles.id` | |
| `title` | text, nullable | |
| `content` | text, nullable | |
| `voice_note_url` | text, nullable | |
| `is_task` | boolean | default `false` |
| `task_status` | enum(`pending`,`completed`), nullable | solo aplica si `is_task = true` |
| `reminder_at` | timestamptz, nullable | apagado por defecto |
| `archived_at` | timestamptz, nullable | |
| `created_at` / `updated_at` | timestamptz | |

Nota importante para la integración de voz futura (§14 de la ficha original): las funciones `completeTask(id)` / `reopenTask(id)` / `toggleTask(id)` ya aisladas en el front-end mapean directo a un `UPDATE notes SET task_status = ...` — sin cambios de diseño necesarios cuando se conecte el comando de voz.

### `statuses` (Estados/Historias)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `profiles.id` | |
| `type` | enum(`text`,`image`,`video`) | |
| `content` | text, nullable | texto o leyenda |
| `media_url` | text, nullable | |
| `background_color` | text, nullable | solo tipo texto |
| `audience` | enum(`everyone`,`contacts_except`,`only_share_with`) | |
| `created_at` | timestamptz | |
| `expires_at` | timestamptz | `created_at + 24h`, calculado al insertar |

### `status_audience_exceptions`
| Columna | Tipo | Notas |
|---|---|---|
| `status_id` | uuid, FK → `statuses.id` | |
| `user_id` | uuid, FK → `profiles.id` | excluido o incluido según `statuses.audience` |

### `status_views`
| Columna | Tipo | Notas |
|---|---|---|
| `status_id` | uuid, FK → `statuses.id` | |
| `viewer_id` | uuid, FK → `profiles.id` | |
| `viewed_at` | timestamptz | |
| PK compuesta | (`status_id`, `viewer_id`) | |

### `paired_devices` (casco/placa — §22 del front-end)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid, PK | |
| `user_id` | uuid, FK → `profiles.id` | |
| `device_name` | text | |
| `device_identifier` | text, nullable | MAC/UUID BLE real — null mientras sea simulado |
| `battery_level` | int, nullable | |
| `is_connected` | boolean | |
| `paired_at` | timestamptz | |
| `last_connected_at` | timestamptz, nullable | |

Esta tabla ya se puede crear ahora tal cual, aunque no exista hardware real todavía — el día que exista la placa, el `device_identifier` deja de ser null y las funciones ya aisladas en `device.ts` simplemente escriben datos reales en las mismas columnas.

---

## 3. Storage (buckets)

| Bucket | Acceso | Contenido |
|---|---|---|
| `avatars` | lectura pública, escritura solo del dueño | fotos de perfil y de grupo |
| `chat-media` | privado, URLs firmadas, solo participantes del chat | imágenes y documentos de mensajes |
| `voice-notes` | privado, URLs firmadas, solo participantes del chat | notas de voz de Chats y Notas |
| `status-media` | privado, URLs firmadas, solo audiencia permitida del estado | fotos/videos de Estados — limpieza automática después de 24h (política de ciclo de vida o job programado) |

---

## 4. Seguridad — enfoque de Row Level Security (RLS)

Principio general: **todo el aislamiento de datos vive en políticas RLS de Postgres, no solo en el código del cliente** — así, aunque el front-end tenga un bug, la base de datos no expone datos de otro usuario. Esto es justo lo que se buscaba evitar de la experiencia previa con Lovable (§0 de la orden de front-end).

Políticas clave a implementar (resumen, se detallan como SQL en la fase de ejecución):

- `profiles`: cualquier usuario autenticado puede leer perfiles básicos (necesario para buscar contactos), pero solo el dueño puede editar el suyo.
- `messages` / `chat_participants` / `message_status` / `message_reactions`: solo lectura/escritura para quienes son `chat_participants` de ese `chat_id` — se verifica con una subconsulta en la política, no confiando en el `user_id` que mande el cliente.
- `notes`: solo el dueño (`user_id = auth.uid()`) puede leer/escribir sus propias notas — nunca compartidas.
- `statuses` / `status_views`: lectura condicionada a la regla de audiencia (`everyone` + no estar en `contacts_except`, o estar en `only_share_with`) cruzada con la tabla `contacts`.
- `paired_devices`: solo el dueño.

## 5. Qué se conecta primero (orden sugerido de ejecución, una vez tengamos proyecto + código)

1. Crear las tablas y políticas RLS descritas arriba (migración inicial).
2. Configurar Auth: proveedor de SMS + verificación de correo.
3. Conectar el flujo de onboarding del front-end (que hoy simula el OTP) a `signInWithOtp` real.
4. Conectar Chats/Mensajes (el núcleo del producto) a datos reales — reemplaza el estado local simulado por lecturas/escrituras a `messages`/`chats`, más suscripciones en tiempo real de Supabase para que los mensajes lleguen sin recargar.
5. Conectar Notas, Contactos, Perfil/Ajustes.
6. Conectar Grupos, reacciones, mensajes que desaparecen, archivar/fijar/silenciar, búsqueda, ubicación, Estados — en ese orden, siguiendo el mismo orden en que se construyeron visualmente.
7. `paired_devices` se conecta al final, cuando exista hardware real (fuera del alcance de esta fase de back-end).

---

## Próximo paso

Confirmas cuando tengas: (a) el ID del proyecto de Supabase creado, y (b) el .zip de Lovable subido al chat — con eso reviso que los nombres coincidan con este esquema, ajusto lo que haga falta, y empezamos a aplicar la migración inicial de verdad.
