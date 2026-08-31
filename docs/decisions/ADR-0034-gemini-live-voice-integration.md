# ADR-0034 — Asistente de voz: integración real con Gemini Live API (primer slice)

**Fecha:** 2026-08-31
**Estado:** Aceptado y **verificado real de punta a punta** — cambia el
proveedor de voz elegido en ADR-0016 (OpenAI Realtime) por Gemini Live
API, decisión explícita del fundador. Sesión Live real contra la API de
Google, con la tool real `list_vehicles` (Supabase real) llamada por el
modelo y respondida correctamente: *"Tienes una moto registrada con la
placa URU89E."* — dato real, no simulado (ver "Verificación" abajo para
el recorrido completo de debugging, incluidos dos bugs reales encontrados
y corregidos contra la API real, no contra supuestos).

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

## Alcance — qué NO se construyó en este slice, y por qué

- **Reproducción de audio real, no todavía.** La sesión se abre con
  `responseModalities: [Modality.AUDIO]` — no por elección, sino porque se
  verificó real que el modelo disponible para esta cuenta
  (`gemini-3.1-flash-live-preview`) **rechaza** `TEXT` solo (cierre de
  socket 1007, "response modalities (TEXT) is not supported by the
  model" — error real de la API, visto en `debug-gemini-live.ts`). La
  sesión sí recibe audio real (PCM), pero como `proyecto-mensajeria` no
  tiene todavía captura de micrófono ni "Modo conducción" (trabajo de
  frontend sin empezar, documentado desde ADR-0016), esos bytes de audio
  se descartan sin reproducir; lo que se usa es
  `outputAudioTranscription`, la transcripción en texto que Gemini manda
  en paralelo — así se pudo verificar el function calling real sin
  necesitar altavoz ni micrófono. Construir reproducción/captura de audio
  real sin poder probarla contra un dispositivo real habría sido
  simulación — se deja para cuando exista esa UI.
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
- **Endpoint/gateway para iniciar una sesión desde el frontend.**
  `GeminiLiveService.startSession()` existe y está probado (ver
  Verificación), pero no hay todavía un WebSocket Gateway de NestJS ni una
  ruta que lo exponga a `proyecto-mensajeria` — eso depende de que exista
  la UI de "Modo conducción" primero.
- **Transcripción de audio de entrada/salida, interrupciones, VAD.** Parte
  del contrato de "Voice session" en `references/voice-assistant.md`, pero
  no aplica todavía sin audio real.

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

## Referencias

- `docs/decisions/ADR-0016-assistant-tool-registry.md` (Tool Registry
  reusado tal cual, decisión de proveedor que este ADR reemplaza)
- `.claude/skills/puntos-movilidad-engineering/references/providers.md`
  (regla de "verificar antes de codificar")
- [Gemini Live API — Tool use](https://ai.google.dev/gemini-api/docs/live-tools)
- [Gemini API — Pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [OpenAI API — Pricing](https://openai.com/api/pricing/)
- `backend/src/modules/assistant/gemini-live.service.ts`
