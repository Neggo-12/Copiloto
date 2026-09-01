# ADR-0034 — Asistente de voz: integración real con Gemini Live API (dos slices)

**Fecha:** 2026-08-31
**Estado:** Aceptado y **verificado real de punta a punta, con micrófono
real** — cambia el proveedor de voz elegido en ADR-0016 (OpenAI Realtime)
por Gemini Live API, decisión explícita del fundador.

Dos slices, ambos verificados reales (no simulados):
1. **Backend (texto por script/WebSocket)**: sesión Live real, tool real
   `list_vehicles` (Supabase real) llamada por el modelo y respondida
   correctamente.
2. **Frontend (micrófono real del navegador → Gemini → voz real de
   vuelta)**: el fundador habló la pregunta "¿qué vehículos tengo
   registrados?" por el micrófono real de `proyecto-mensajeria`
   (pestaña Copiloto → Voz), Gemini llamó `list_vehicles` de verdad,
   Supabase respondió real, y el fundador **escuchó la respuesta en voz
   real** ("Tienes una moto registrada con placas URU89E", voz femenina
   sintetizada por Gemini) — primera conversación de voz de punta a punta
   de la plataforma, confirmada por el fundador, no inferida.

Ver "Verificación" abajo para el recorrido completo de debugging de ambos
slices, incluidos varios bugs reales encontrados y corregidos contra la
API/el navegador real, no contra supuestos.

## Contexto

ADR-0016 dejó documentado el Tool Registry del asistente (9 tools reales,
`AssistantToolsService`, probado 17/17 casos) y explícitamente fuera de
alcance la integración "Voice → Realtime/STT" y "Result → Voice", porque
requería que el fundador provisionara una cuenta/API key de un proveedor de
voz en tiempo real — en ese momento, `providers.md` documentaba OpenAI
Realtime como el proveedor a usar.

El 2026-08-31, en el mismo día que se resolvió un problema de facturación
de la cuenta de Google AI Studio/Gemini del fundador (crédito real
disponible, ver bitácora del chat — no hay ADR de eso, es administración
de cuenta, no ingeniería), el fundador pidió explícitamente evaluar si
convenía usar Gemini en vez de OpenAI para esto, dado que ya hay saldo real
disponible en esa cuenta y no en ninguna de OpenAI.

Investigación real antes de decidir (no supuesto):

- Gemini Live API **sí soporta function calling en tiempo real**
  (`ai.google.dev/gemini-api/docs/live-tools`), con el mismo formato base
  de JSON Schema (a nivel de API REST) que ya usa nuestro Tool Registry.
- Precio real (`ai.google.dev/gemini-api/docs/pricing`, modelo
  `gemini-3.1-flash-live-preview`): ~$0.005/min de audio de entrada,
  ~$0.018/min de salida — mucho más barato que OpenAI Realtime
  (`gpt-realtime-2.1`: $32/1M tokens de audio de entrada, $64/1M de
  salida, `openai.com/api/pricing`).
- Estado real: Gemini Live API está en **Preview** — Google puede cambiar
  el contrato. Riesgo real, no ocultado.

Con esa información (no antes), el fundador eligió Gemini Live API.

## Decisión

**`GeminiLiveService`** (`backend/src/modules/assistant/gemini-live.service.ts`)
— adapter nuevo dentro del `AssistantModule` ya existente (REUSE: no se
tocó ninguna tool, ni `AssistantToolsService`, ni el controller REST — el
Tool Registry es 100% provider-agnostic por diseño desde ADR-0016, y eso
es lo que permitió cambiar de proveedor sin reescribir la mitad ya
construida).

**Traduce el Tool Registry al formato exacto que exige el SDK.** Aquí
apareció una diferencia real entre lo que muestra la página de
documentación REST de Gemini (`"type": "object"`, minúsculas, JSON Schema
estándar) y lo que el **SDK de Node** (`@google/genai`) exige en su tipo
`Schema`: un enum `Type` en MAYÚSCULAS (`Type.OBJECT`, `Type.STRING`).
Verificado instalando el paquete real y corriendo `tsc --noEmit` contra
sus propios `.d.ts` — sin la función `toGeminiParameters()` que hace esa
traducción, el proyecto no compila. Esto es exactamente el tipo de detalle
que `providers.md` pide verificar contra el SDK real, no contra un resumen
de docs.

**Sesión Live real, con las 9 tools completas declaradas** —
`functionDeclarations` sale de `AssistantToolsService.list()` tal cual,
sin lista aparte que mantener sincronizada a mano.

**Cuando el modelo llama una tool, se ejecuta la real** —
`session.onmessage` detecta `message.toolCall.functionCalls`, cada una se
manda a `AssistantToolsService.execute()` (el mismo dispatcher que ya usa
el endpoint REST — ni una tool nueva, ni un camino de ejecución paralelo),
y la respuesta real se manda de vuelta con `session.sendToolResponse()`.

**Segundo slice — audio real bidireccional + frontend real.**
`GeminiLiveService.sendAudioChunk()`/`endAudioStream()` mandan audio real
del micrófono a Gemini (`session.sendRealtimeInput`); `onAudio` expone los
chunks reales de audio de salida (`serverContent.modelTurn.parts[].inlineData`).
Nuevo **`AssistantVoiceGateway`** (`backend/src/modules/assistant/assistant-voice.gateway.ts`)
expone todo esto por WebSocket real (`/assistant-voice`) — REUSE explícito
del mismo patrón de auth que `LocationGateway` (token en
`handshake.auth.token` → `supabase.auth.getUser`). Del lado de
`proyecto-mensajeria`: `lib/audio/pcm.ts` (conversión PCM real: downsample
del micrófono a 16kHz, base64, y de vuelta para reproducir), el hook
`useGeminiVoiceSession.ts` (captura real con `ScriptProcessorNode`,
reproducción real con `AudioBufferSourceNode` encadenado) y la pantalla
`AsistenteVozScreen.tsx`, integrada como cuarta sub-pestaña ("Voz") dentro
de Copiloto — REUSE del mismo patrón de conexión que `useCopilotoRealtime`
(`getBackendAccessToken()` + `io(namespace, {auth:{token}})`).

## Alcance — qué SÍ se construyó y verificó real, qué falta y por qué

- **Voz real bidireccional — CONFIRMADA con micrófono real.** El fundador
  habló por el micrófono real de `proyecto-mensajeria` y escuchó la
  respuesta real de Gemini en voz (ver "Verificación"). Esto NO existía al
  escribir el primer slice de este mismo ADR (que solo tenía transcripción
  de texto, sin frontend) — se completó en una segunda pasada, misma
  sesión.
- **Confirmación de `activate_emergency_corridor` por voz.** El contrato
  REST usa `ctx.confirmed` (un flag que viene del body del request, no de
  los argumentos que controla el modelo) para la segunda llamada
  confirmada. En este slice, `GeminiLiveService` manda **siempre**
  `confirmed: false` a `AssistantToolsService.execute()`, sin importar qué
  haya "dicho" la sesión de voz. Efecto real: si alguien le pide al
  asistente por voz que active el corredor de emergencia, la tool
  responde `needs_confirmation` (un resumen en texto) y el modelo puede
  preguntarle a la persona "¿confirmas?" — pero la activación real
  (geocoding, routing, `RouteSessionService.start()`) **nunca ocurre por
  este camino todavía**. Es una limitación deliberada y seria — no un
  descuido — porque decidir CÓMO debe fluir una confirmación de alto
  riesgo por voz (¿una palabra clave? ¿un botón físico en la app mientras
  tanto?) es una decisión de producto que no se toma sola dentro de un
  ADR de infraestructura.
- **Lo que SÍ existe ahora** (segundo slice, ver arriba): `AssistantVoiceGateway`
  expone la sesión real por WebSocket, y `AsistenteVozScreen` la consume
  real desde el navegador — confirmado con micrófono real.
- **Lo que sigue faltando, honesto:**
  - **"Modo conducción" de verdad** (UX manos-libres: activación por voz
    sin tocar la pantalla, funcionar con el teléfono bloqueado/en
    background, interfaz pensada para no distraer mientras se maneja) —
    hoy es un botón que hay que tocar y sostener la pantalla abierta,
    suficiente para verificar el pipeline técnico, no para usarlo real
    manejando.
  - **`ScriptProcessorNode`**, no `AudioWorkletNode` — API deprecada pero
    universal; sin evidencia todavía de que haga falta migrar.
  - Sin prueba en dispositivo móvil real ni manejando de verdad — solo
    navegador de escritorio.

## Verificación

- **Tipos reales del SDK**: se instaló `@google/genai@2.19.0` en un
  proyecto aislado y se corrió `tsc --noEmit` con las mismas opciones que
  `backend/tsconfig.json` (`strict`, `skipLibCheck`, `target ES2022`,
  `moduleResolution node`) contra un archivo que reproduce exactamente la
  lógica de `GeminiLiveService` — 0 errores después de agregar
  `toGeminiParameters()`. Sin ese paso se hubiera enviado un
  `FunctionDeclaration[]` con el `type` equivocado (string en vez del enum
  `Type`), que ni siquiera compila.
- **Nombre del modelo — dos correcciones reales, no una**: el nombre del
  ejemplo que trae el propio paquete instalado
  (`gemini-live-2.5-flash-preview`) **no existe** para esta cuenta (cierre
  de socket real 1008: *"models/gemini-live-2.5-flash-preview is not
  found for API version v1beta, or is not supported for
  bidiGenerateContent"*). Se corrigió preguntándole a la API real (no
  adivinando de nuevo): `scripts/list-gemini-live-models.ts` llama
  `ai.models.list()` y filtra por `supportedActions.includes
  ("bidiGenerateContent")`, devolviendo 7 modelos reales disponibles para
  esta cuenta. Se eligió `gemini-3.1-flash-live-preview`. Configurable por
  `GEMINI_LIVE_MODEL` sin tocar código, porque estos nombres cambian.
- **`typecheck`/`lint`/`build` del backend completo**: corrido real en la
  máquina del fundador tras `bun install` (baja `@google/genai`) — limpio,
  sin errores.
- **Sesión Live real contra la API de Google — CONFIRMADA, con dos bugs
  reales encontrados y corregidos en el camino** (no una prueba limpia a
  la primera — se documenta el recorrido completo por honestidad):
  1. **Modalidad de respuesta** (cierre 1007, ver arriba): resuelto
     cambiando a `responseModalities: [Modality.AUDIO]` +
     `outputAudioTranscription: {}`, leyendo el texto de
     `serverContent.outputTranscription.text` en vez de `message.text`
     (que con audio como modalidad siempre viene vacío — verificado
     leyendo el getter real `LiveServerMessage.text` en el `.d.ts` del
     SDK). Confirmado con `debug-gemini-live.ts`: llegó transcripción real
     ("Hola, sí...") junto con los chunks de audio.
  2. **Race condition real (TDZ) en `startSession()`**: el SDK invoca
     `onmessage` de forma síncrona durante `connect()` (llegan mensajes de
     handshake como `setupComplete`/`sessionResumptionUpdate` antes de que
     la promesa resuelva) — con `const session = await
     this.ai.live.connect(...)`, esa invocación temprana de `onmessage`
     intentaba leer `session` antes de su inicialización:
     `ReferenceError: Cannot access 'session' before initialization`, error
     real visto corriendo `verify-gemini-live.ts`. Corregido con `let
     session: Session | undefined` declarado antes de `connect()`, y
     `handleMessage()` tolera `session` indefinida en esos mensajes
     tempranos (que nunca traen `functionCall`, así que no hace falta la
     sesión ahí).
  Con ambos corregidos, `verify-gemini-live.ts` — que instancia la clase
  real `GeminiLiveService` con la tool real `list_vehicles` →
  `VehiclesService` → Supabase real — abrió sesión, Gemini llamó
  `list_vehicles` de verdad, `AssistantToolsService` la ejecutó contra
  Supabase real, y el modelo respondió: *"Tienes una moto registrada con
  la placa URU89E."* — coincide exactamente con el dato real (mismo
  vehículo confirmado antes por REST). Petición real de punta a punta,
  confirmada.
- **Segundo slice — `AssistantVoiceGateway` + frontend, CONFIRMADO con
  micrófono real**, con más bugs reales encontrados en el camino:
  1. **Race condition real a nivel de WebSocket** (mismo tipo de bug que
     el de TDZ arriba, pero en otra capa): el evento `connect` del
     CLIENTE dispara al terminar el handshake de transporte, ANTES de que
     `handleConnection` (dos `await` reales: verificar token, abrir
     sesión Gemini) termine — un mensaje mandado justo al conectar se
     perdía en silencio. Confirmado con `verify-voice-gateway.ts` (conectó,
     mandó el turno, nunca llegó respuesta, sin error). Corregido con un
     evento explícito `voice:ready` que el cliente espera antes de mandar
     nada.
  2. **`Float32Array<ArrayBuffer>` vs. `Float32Array<ArrayBufferLike>`**:
     TypeScript 5.7+ hizo genéricos los TypedArrays; `AudioBuffer.copyToChannel`
     exige la variante respaldada por `ArrayBuffer` real, y el tipo de
     retorno de `int16ToFloat32` (sin anotar) se ensanchaba a
     `ArrayBufferLike` — error real de `tsc`, corregido anotando el tipo de
     retorno explícito.
  3. **El backend se cae/desactualiza entre pruebas** (no es un bug de
     código — mismo síntoma "websocket error" real dos veces distintas,
     ambas resueltas reiniciando `bun run start:dev`) — dejar anotado
     porque costó tiempo real de debugging distinguir "el código está mal"
     de "el proceso simplemente no está corriendo la versión nueva".
  Con todo corregido: el fundador abrió la pestaña Copiloto → Voz en
  `proyecto-mensajeria`, tocó el micrófono, dio permiso real del
  navegador, preguntó en voz real "¿qué vehículos tengo registrados?", y
  **escuchó la respuesta real en voz** ("Tienes una moto registrada con
  placas URU89E", voz femenina sintetizada por Gemini) — confirmado
  directamente por el fundador. Primera conversación de voz real de
  punta a punta de la plataforma: micrófono real → WebSocket real →
  Gemini Live real → tool real → Supabase real → voz real de vuelta.
- **Bug real #4, encontrado DESPUÉS de la prueba exitosa** (el fundador
  siguió probando y reportó "me responden como 5 agentes a la vez"):
  `useGeminiVoiceSession.start()` no tenía guarda contra llamarse dos
  veces sin haber cerrado la sesión anterior (doble tap, reintentos tras
  un error, la reconexión automática de socket.io reviviendo un socket
  viejo en segundo plano). Cada llamada abría un `AudioContext`+socket+
  sesión de Gemini nuevos SIN cerrar los anteriores — el mismo micrófono
  real terminaba mandando el mismo audio a varias sesiones de Gemini
  simultáneas, cada una con su propio historial de conversación y
  respondiendo por su lado, todas reproduciéndose a la vez por los
  mismos parlantes. Corregido con `cleanup()` defensivo al inicio de
  `start()` (garantiza como máximo una sesión viva) + `reconnection:
  false` en el socket (una desconexión ya no revive sola en segundo
  plano — el usuario debe tocar el micrófono de nuevo, pasando otra vez
  por el `cleanup()` de guarda) + limpieza también en `connect_error`/
  `disconnect` (antes solo pasaba en `voice:closed`) + limpieza al
  desmontar el componente. Pendiente: re-confirmar con el fundador que
  una sola voz responde después de este fix (encontrado y corregido
  antes de esa reconfirmación).
- **`typecheck`/`lint` de `proyecto-mensajeria`**: corridos reales en la
  máquina del fundador tras los fixes de arriba — limpios (solo
  advertencias preexistentes, no relacionadas a este ADR).
- **Bug real #5, el más serio de esta ronda — encontrado en pruebas de voz
  reales del fundador (2026-09-01)**: `GeminiLiveService.executeCall()`
  mandaba **siempre** `confirmed: false` a `AssistantToolsService.execute()`
  — no solo para `activate_emergency_corridor` (comportamiento deliberado,
  ver "Alcance" arriba), sino para CUALQUIER tool con
  `requiresConfirmation: true` (ej. `send_message`). Efecto real: el
  asistente preguntaba "¿confirmas enviar el mensaje a...?", el fundador
  decía que sí por voz, y la tool volvía a recibir `confirmed: false` en la
  segunda llamada — el mensaje nunca se mandaba de verdad, en loop.
  Corregido en dos partes: (1) `toGeminiParameters()` ahora declara un
  parámetro `confirmed: boolean` en el schema que Gemini ve, PERO solo para
  las tools con `requiresConfirmation` (para que el modelo sepa que existe
  y lo mande en `true` en la segunda llamada, tras la confirmación de
  palabra del usuario); (2) `executeCall()` lee
  `call.args?.["confirmed"] === true` en vez del `false` fijo — con la
  excepción explícita de `activate_emergency_corridor`, que sigue forzado a
  `false` siempre (la limitación deliberada de "Alcance" arriba sigue
  vigente, sin cambios). Verificado real: el fundador confirmó por voz
  varios mensajes distintos tras el fix, y esta vez sí se mandaron.
- **Nueva tool de voz, misma ronda: `create_note_reminder`**
  (`backend/src/modules/assistant/tools/create-note-reminder.tool.ts`).
  `create_location_reminder` (ADR-0016) solo cubre recordatorios
  geolocalizados — para "recuérdame mañana a las 8am pagar el arriendo" no
  hay ninguna dirección que geocodificar. Cero superficie nueva de dominio:
  reusa `LocationRemindersService.create({kind:"note", remindAt})` y
  `NoteReminderSchedulerService.schedule()`, exactamente el mismo camino
  que ya usa `POST /location-reminders` (ADR-0030) — solo expuesto también
  a la voz, mismo `isValidIsoDate` que el controller real. Registrado en
  `AssistantToolsService`/`AssistantModule` junto a las demás tools.
  Pendiente: confirmación por voz real del fundador (agregada, no probada
  todavía en esta sesión).
- **Barge-in real (interrupción durante Modo conducción manos-libres)**.
  Gemini Live manda `serverContent.interrupted: true` cuando el usuario
  empieza a hablar mientras el modelo todavía está generando/reproduciendo
  su respuesta anterior — esta señal ya existía en la API (mencionada como
  pendiente en un comentario de una ronda anterior de este ADR) pero no se
  leía en ningún lado: ni `GeminiLiveService`, ni `AssistantVoiceGateway`,
  ni el frontend. Efecto real: si el conductor interrumpía al asistente,
  la respuesta vieja seguía sonando encima de la nueva — justo el
  comportamiento que "Modo conducción manos-libres" no puede tener (el
  conductor necesita poder cortar al asistente sin esperar a que termine
  de hablar). Cambio de tres capas, sin superficie nueva de dominio:
  1. `GeminiLiveService.handleMessage()` revisa
     `message.serverContent?.interrupted` independiente del resto del
     mensaje (puede llegar sin texto/audio propio) y llama al nuevo
     callback `onInterrupted?: () => void`.
  2. `AssistantVoiceGateway` reenvía la señal tal cual al cliente:
     `onInterrupted: () => client.emit("voice:interrupted", {})`.
  3. `useGeminiVoiceSession` ahora guarda cada `AudioBufferSourceNode`
     agendado en `activeSourcesRef` (con limpieza en `onended`), y al
     recibir `voice:interrupted` llama `stopPlayback()`, que corta
     (`.stop()`, válido tanto en fuentes sonando como agendadas a futuro —
     comportamiento estándar de Web Audio API) todo lo que quedaba de la
     respuesta anterior y resetea el cursor de reproducción
     (`nextPlaybackTimeRef`) al tiempo actual, para que el audio nuevo
     empiece a agendarse desde ya, no desde donde iba a terminar el viejo.
  Confirmado real por el fundador el mismo día, interrumpiendo con
  micrófono real a mitad de frase: "funciono perfecto".
- **Downsampling con anti-aliasing real** (`lib/audio/pcm.ts`, 2026-09-01).
  Gap documentado desde el primer slice de este ADR: `downsampleTo`
  decimaba por promedio de bloque sin ningún filtro previo — cualquier
  frecuencia de entrada por encima de la nueva Nyquist (`targetSampleRate
  / 2`) se pliega hacia abajo como ruido audible real (aliasing) en vez de
  perderse limpio. Corrección: nueva función `onePoleLowPass` (filtro
  pasa-bajos de un polo, diseño RC estándar — `alpha = dt/(rc+dt)`, `rc =
  1/(2π·fc)`), aplicada dos veces en cascada (12 dB/octava, suficiente para
  el caso real sin pagar el costo de una convolución FIR completa dentro
  de `ScriptProcessorNode.onaudioprocess`, que corre en tiempo real y no
  puede bloquear) con corte en `targetSampleRate * 0.45`, antes de la
  decimación existente (que no se tocó). Verificación real, no mock: se
  aisló la lógica (vieja y nueva) en un proyecto separado y se corrió un
  test con el algoritmo de Goertzel (mide la energía de una frecuencia
  específica dentro de una señal) sobre una señal sintética de 48kHz con
  una componente de voz real (1000Hz) y una componente que debía generar
  alias real al bajar a 16kHz (10000Hz) — resultado medido:
  - Energía del alias (6000Hz): 0.3035 → 0.0716 (reducción real del 76.4%).
  - Energía de la voz real (1000Hz): 0.5966 → 0.5751 (se conserva el
    96.4%, la pérdida es el precio esperado y aceptado de cualquier filtro
    real, no ideal).
  También se corrió `bun build` real sobre el archivo modificado
  (`--target=browser`) — compila limpio, sin errores.

## Referencias

- `docs/decisions/ADR-0016-assistant-tool-registry.md` (Tool Registry
  reusado tal cual, decisión de proveedor que este ADR reemplaza)
- `.claude/skills/puntos-movilidad-engineering/references/providers.md`
  (regla de "verificar antes de codificar")
- [Gemini Live API — Tool use](https://ai.google.dev/gemini-api/docs/live-tools)
- [Gemini API — Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API — Pricing](https://openai.com/api/pricing/)
- `backend/src/modules/assistant/gemini-live.service.ts`
- `backend/src/modules/assistant/assistant-voice.gateway.ts`
- `proyecto-mensajeria/src/lib/audio/pcm.ts`
- `proyecto-mensajeria/src/hooks/useGeminiVoiceSession.ts`
- `proyecto-mensajeria/src/components/copiloto/AsistenteVozScreen.tsx`
