import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenAI, Modality, Type } from "@google/genai";
import type { FunctionCall, LiveServerMessage, Schema, Session } from "@google/genai";
import type { EnvConfig } from "../../config/env.validation";
import { AssistantToolsService, type ToolDescriptor } from "./assistant-tools.service";
import type { ToolOutcome } from "./assistant.types";

export interface GeminiLiveCallbacks {
  onText?: (text: string) => void;
  /**
   * Chunk de audio real que Gemini generó como respuesta (PCM, base64 —
   * mismo formato que llega crudo del SDK, sin decodificar aquí: decodificar/
   * reproducir es responsabilidad de quien consume esto, hoy
   * `AssistantVoiceGateway`). `mimeType` trae la tasa real (ej.
   * `"audio/pcm;rate=24000"`, verificado contra la respuesta real del
   * servidor) — no asumir una tasa fija.
   */
  onAudio?: (base64Data: string, mimeType: string) => void;
  /**
   * El usuario empezó a hablar mientras Gemini todavía estaba respondiendo
   * (barge-in real) — Gemini manda `serverContent.interrupted: true` en ese
   * momento (confirmado real durante la verificación de ADR-0034, ver
   * comentario ahí). Hasta ahora este slice recibía la señal pero nunca la
   * exponía ni el cliente actuaba sobre ella — el audio viejo seguía
   * reproduciéndose encima de lo nuevo. Modo conducción manos-libres real
   * necesita esto: si el conductor interrumpe, la respuesta vieja debe
   * callarse YA, no esperar a que termine su cola de audio.
   */
  onInterrupted?: () => void;
  /**
   * Resultado real de CADA tool call, apenas se ejecuta (antes de que
   * Gemini termine de responder en voz) — bug real corregido 2026-09-02: no
   * existía ningún camino para que un resultado de tool llegara al cliente
   * más que como texto narrado por el modelo, así que una tool con efecto
   * real en el navegador (`open_navigation`, que necesita que el navegador
   * mismo abra un link) no tenía forma de comunicárselo. El llamador
   * (`AssistantVoiceGateway`) decide qué tools le importan; las demás
   * simplemente no hacen nada con esto.
   */
  onToolResult?: (name: string, outcome: ToolOutcome) => void;
  onClose?: () => void;
  onError?: (message: string) => void;
}

export interface GeminiLiveSessionHandle {
  sendText(text: string): void;
  /**
   * Manda un chunk de audio real del micrófono (PCM 16-bit mono, base64).
   * `mimeType` debe incluir la tasa real de muestreo del chunk (ej.
   * `"audio/pcm;rate=16000"` — 16kHz es lo que documenta Gemini Live para
   * audio de ENTRADA, distinto a los 24kHz que manda de SALIDA; ver
   * comentario de clase — pendiente de confirmar con una sesión real de
   * micrófono, no asumir ciegamente sin esa prueba).
   */
  sendAudioChunk(base64Pcm: string, mimeType: string): void;
  /** Señala fin del turno de audio (ej. el usuario soltó el botón de hablar o el VAD detectó silencio). */
  endAudioStream(): void;
  close(): void;
}

/**
 * Traduce nuestro `ToolParameterSchema` (JSON Schema plano, minúsculas —
 * mismo formato que ya usa `GET /assistant/tools`) al `Schema` que pide el
 * SDK de Gemini (`Type` en mayúsculas: "OBJECT", "STRING"...). Verificado
 * contra los tipos reales instalados de `@google/genai` antes de escribir
 * esto (no contra la página de docs, que muestra minúsculas para la API
 * REST cruda pero el SDK de Node exige este enum) — sin este mapeo,
 * `typecheck` falla real.
 */
const JSON_SCHEMA_TYPE_TO_GEMINI: Record<string, Type> = {
  object: Type.OBJECT,
  string: Type.STRING,
  number: Type.NUMBER,
  integer: Type.INTEGER,
  boolean: Type.BOOLEAN,
  array: Type.ARRAY,
};

/**
 * `requiresConfirmation` agrega un parámetro `confirmed` (opcional, solo en
 * las tools que lo necesitan) — bug real corregido 2026-08-31: antes
 * `executeCall` mandaba SIEMPRE `confirmed: false`, sin darle al modelo
 * ninguna forma de expresar "el usuario ya dijo que sí" en la segunda
 * llamada, así que CUALQUIER tool confirmable (ej. `send_message`) quedaba
 * en un loop infinito de "¿confirmas?" — confirmado real con una
 * conversación real del fundador donde mandar un mensaje nunca se ejecutó
 * pese a confirmar varias veces de palabra. Con este parámetro declarado,
 * el modelo puede volver a llamar la misma tool con `confirmed: true` una
 * vez el usuario confirma en voz — `executeCall` de todas formas ignora
 * este valor para `activate_emergency_corridor` (ver ahí), que sigue sin
 * poder confirmarse por voz a propósito.
 */
function toGeminiParameters(parameters: ToolDescriptor["parameters"], requiresConfirmation: boolean) {
  const properties: Record<string, Schema> = Object.fromEntries(
    Object.entries(parameters.properties).map(([key, prop]) => [
      key,
      {
        type: JSON_SCHEMA_TYPE_TO_GEMINI[prop.type] ?? Type.STRING,
        description: prop.description,
        ...(prop.enum ? { enum: prop.enum } : {}),
      },
    ]),
  );

  if (requiresConfirmation) {
    properties["confirmed"] = {
      type: Type.BOOLEAN,
      description:
        "Poner en true SOLO en la segunda llamada a esta misma tool, después de que el usuario haya confirmado de palabra la acción descrita en el 'summary' de needs_confirmation. No poner en true en la primera llamada.",
    };
  }

  return {
    type: Type.OBJECT,
    properties,
    required: parameters.required,
  };
}

/**
 * Bug real reportado 2026-09-02 (el fundador probando en la calle):
 * `startSession()` nunca mandaba `systemInstruction` — el modelo tenía
 * libertad total para narrar lo que quisiera, incluyendo afirmar que había
 * "mostrado la ruta en Google Maps" cuando `calculate_route` (solo lectura,
 * ver su comentario de clase) nunca abrió nada. Este texto es la corrección
 * mínima: reglas de honestidad + la distinción real entre `calculate_route`
 * (solo calcula) y `open_navigation` (la única que de verdad abre Maps).
 */
const SYSTEM_INSTRUCTION = `Eres el asistente de voz de Vozz/Copiloto — ayudas a conductores en Medellín con mensajes, recordatorios, rutas y modo de manejo, hablando en español.

Regla más importante, sin excepción: NUNCA digas que hiciste algo que no hiciste. Solo puedes afirmar una acción real (enviar un mensaje, crear un recordatorio, abrir una ruta, etc.) DESPUÉS de que la tool correspondiente te devuelva un resultado exitoso — nunca antes, nunca por suponer que "debería funcionar". Si una tool falla o no existe para lo que pide el usuario, dilo con honestidad en vez de inventar que ya se hizo.

Sobre rutas específicamente: "calculate_route" SOLO calcula distancia y tiempo estimado — nunca abre ni muestra nada en el teléfono del usuario por sí sola. Si el usuario quiere ver/abrir la ruta de verdad (dijo que sí, "muéstramela", "ábrela", "llévame"), tienes que llamar "open_navigation" — esa es la única tool que de verdad abre Google Maps. Nunca digas "ya te la mostré" o "deberías verla en Google Maps" a menos que "open_navigation" ya haya respondido con éxito.

Sé breve y natural, como una conversación real mientras alguien maneja — no leas listas ni uses formato de texto, todo lo que digas se convierte en voz.`;

/**
 * Adapter de Gemini Live API (ADR-0034 — reemplaza la elección de OpenAI
 * Realtime de ADR-0016 por decisión explícita del fundador, ya con saldo
 * real en la cuenta de Google/Gemini). Cubre la mitad del pipeline que
 * ADR-0016 dejó pendiente a propósito: "Voice → Realtime/STT" y
 * "Result → Voice". La otra mitad — "Tool Call → Authorization/
 * Confirmation → Application Service → Domain → Result" — ya existía
 * (`AssistantToolsService`) y se reusa tal cual, sin tocarla.
 *
 * Alcance deliberado de este primer slice (ver ADR-0034):
 * - `responseModalities: [Modality.AUDIO]` con `outputAudioTranscription`:
 *   verificado contra la cuenta real (no contra el ejemplo del SDK) que
 *   `gemini-3.1-flash-live-preview` RECHAZA `TEXT` solo (cierre 1007,
 *   "response modalities (TEXT) is not supported by the model") — este
 *   modelo exige audio como modalidad de respuesta. `onAudio` (segundo
 *   slice) expone esos chunks reales de audio de salida (`serverContent.
 *   modelTurn.parts[].inlineData`, verificado con la sesión real) a quien
 *   abra la sesión — hoy `AssistantVoiceGateway`, que los reenvía tal cual
 *   por WebSocket al navegador para reproducirlos. `outputTranscription`
 *   se sigue exponiendo también por `onText`, útil para logging/depuración
 *   aunque ya haya audio real.
 * - `sendAudioChunk`/`endAudioStream` (segundo slice) mandan audio real de
 *   micrófono a Gemini vía `session.sendRealtimeInput({ audio, ... })` —
 *   forma verificada contra los tipos reales del SDK (`Blob` = `{ data:
 *   base64, mimeType }`, `LiveSendRealtimeInputParameters`), pero la
 *   sesión real de punta a punta CON micrófono real todavía no se probó
 *   (eso requiere el frontend de "Modo conducción", que no existe aún) —
 *   no se declara "funciona" hasta verlo pasar con audio real, mismo
 *   criterio de honestidad del resto del proyecto.
 * - `ctx.confirmed` refleja lo que el modelo realmente mande de vuelta
 *   (parámetro `confirmed`, ver `toGeminiParameters`) — corregido
 *   2026-08-31: antes quedaba SIEMPRE `false`, lo que bloqueaba por error
 *   CUALQUIER tool confirmable (no solo la de emergencia), incluyendo
 *   `send_message`. La ÚNICA excepción deliberada que se mantiene es
 *   `activate_emergency_corridor` (ver `executeCall`): si el modelo la
 *   llama, la tool (ADR-0016) responde `needs_confirmation` y NUNCA
 *   ejecuta el efecto real (geocoding/routing/`RouteSessionService.start()`),
 *   sin importar qué `confirmed` mande el modelo — activar la emergencia
 *   de verdad por voz sigue fuera de este slice a propósito.
 */
@Injectable()
export class GeminiLiveService {
  private readonly logger = new Logger(GeminiLiveService.name);
  private readonly ai: GoogleGenAI | null;
  private readonly model: string;

  constructor(
    config: ConfigService<EnvConfig, true>,
    private readonly tools: AssistantToolsService,
  ) {
    const apiKey = config.get("GEMINI_API_KEY", { infer: true });
    this.model = config.get("GEMINI_LIVE_MODEL", { infer: true });
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    if (!this.ai) {
      this.logger.warn(
        "Gemini Live sin configurar (falta GEMINI_API_KEY en el entorno) — startSession() no hace nada hasta completarla en backend/.env",
      );
    }
  }

  get configured(): boolean {
    return this.ai !== null;
  }

  /**
   * Abre una sesión Live real para `userId`, con el Tool Registry completo
   * (las 9 tools de `AssistantToolsService`) pasado como
   * `functionDeclarations`. `onText` recibe cada fragmento de respuesta en
   * texto; el llamador decide qué hacer con eso (loguear, mandarlo por un
   * socket a un cliente de prueba, etc. — fuera del alcance de este
   * adapter).
   */
  async startSession(userId: string, callbacks: GeminiLiveCallbacks = {}): Promise<GeminiLiveSessionHandle | null> {
    if (!this.ai) return null;

    const functionDeclarations = this.tools.list().map(({ name, description, parameters, requiresConfirmation }) => ({
      name,
      description,
      parameters: toGeminiParameters(parameters, requiresConfirmation),
    }));

    // `let` sin inicializar (no `const`): verificado real (no supuesto) que
    // el SDK invoca `onmessage` de forma SÍNCRONA durante `connect()` —
    // llegan mensajes de handshake (`setupComplete`, `sessionResumptionUpdate`)
    // ANTES de que la promesa de `connect()` resuelva. Con `const session =
    // await ...`, esa invocación temprana de `onmessage` cae en temporal
    // dead zone real (`ReferenceError: Cannot access 'session' before
    // initialization`, confirmado corriendo `verify-gemini-live.ts`). Este
    // `let` sí queda en `undefined` (no en TDZ) desde que se ejecuta esta
    // línea, antes de llamar `connect()` — por eso el fix funciona: session
    // legítimamente puede llegar `undefined` a `handleMessage` en esos
    // primeros mensajes, así que ese método debe tolerarlo (ver abajo).
    let session: Session | undefined;
    // A PROPÓSITO, no un descuido: `eslint` solo ve una asignación y sugiere
    // `const`, pero fusionar declaración + `await` en una sola sentencia
    // (`const session = await ...`) es EXACTAMENTE el bug real de TDZ ya
    // confirmado arriba. Debe quedar como dos sentencias separadas (`let`
    // sin inicializar, después asignar) para que `session` salga de la TDZ
    // antes de llamar `connect()`. No "corregir" esto a `const` sin releer
    // el comentario de arriba.
    // eslint-disable-next-line prefer-const
    session = await this.ai.live.connect({
      model: this.model,
      config: {
        // AUDIO, no TEXT: verificado real que este modelo rechaza TEXT solo
        // (ver comentario de clase). `outputAudioTranscription: {}` pide la
        // transcripción en texto en paralelo — es lo único que este slice
        // consume; el audio en sí se descarta en `handleMessage`.
        responseModalities: [Modality.AUDIO],
        outputAudioTranscription: {},
        tools: [{ functionDeclarations }],
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      callbacks: {
        onopen: () => this.logger.log(`Sesión Gemini Live abierta (userId=${userId}, model=${this.model})`),
        onmessage: (message: LiveServerMessage) => void this.handleMessage(userId, session, message, callbacks),
        onerror: (e: ErrorEvent) => {
          this.logger.error(`Sesión Gemini Live: error (userId=${userId}): ${e.message}`);
          callbacks.onError?.(e.message);
        },
        onclose: () => callbacks.onClose?.(),
      },
    });
    const openedSession = session;

    return {
      sendText: (text: string) => openedSession.sendClientContent({ turns: text, turnComplete: true }),
      sendAudioChunk: (base64Pcm: string, mimeType: string) => openedSession.sendRealtimeInput({ audio: { data: base64Pcm, mimeType } }),
      endAudioStream: () => openedSession.sendRealtimeInput({ audioStreamEnd: true }),
      close: () => openedSession.close(),
    };
  }

  private async handleMessage(
    userId: string,
    session: Session | undefined,
    message: LiveServerMessage,
    callbacks: GeminiLiveCallbacks,
  ): Promise<void> {
    const functionCalls = message.toolCall?.functionCalls;
    if (functionCalls && functionCalls.length > 0) {
      if (!session) {
        // No debería pasar en la práctica (las tool calls solo llegan en
        // respuesta a un turno que el llamador manda DESPUÉS de que
        // `startSession()` ya retornó, momento en el que `session` ya está
        // asignada) — pero si algún día pasa, mejor loguearlo fuerte que
        // tronar con un TypeError silencioso.
        this.logger.error(`Sesión Gemini Live (userId=${userId}): llegó functionCall antes de que la sesión terminara de abrir — se ignora.`);
        return;
      }
      const responses = await Promise.all(functionCalls.map((call) => this.executeCall(userId, call)));
      // Ver comentario de `onToolResult` en `GeminiLiveCallbacks` — se manda
      // ANTES de que Gemini termine de narrar la respuesta en voz, para que
      // el navegador pueda reaccionar (ej. `open_navigation` abriendo Maps)
      // sin esperar al audio.
      for (const response of responses) {
        callbacks.onToolResult?.(response.name, response.response.output);
      }
      session.sendToolResponse({ functionResponses: responses });
      return;
    }

    // Con `responseModalities: [Modality.AUDIO]`, `message.text` (el getter
    // que lee partes de texto de `modelTurn`) siempre viene vacío — el
    // contenido de `modelTurn` es audio. El texto real llega aparte, en la
    // transcripción de salida (ver comentario de clase y config arriba).
    // Barge-in real (ver comentario de `onInterrupted` en `GeminiLiveCallbacks`):
    // se revisa independiente del resto — un mensaje de "interrupted" puede
    // llegar sin texto/audio propio, solo la señal de que hay que cortar lo
    // que se estaba reproduciendo.
    if (message.serverContent?.interrupted) {
      callbacks.onInterrupted?.();
    }

    const text = message.serverContent?.outputTranscription?.text;
    if (text) callbacks.onText?.(text);

    // Audio real de salida (segundo slice): cada `part.inlineData` con
    // datos es un chunk de audio PCM en base64 — se reenvía tal cual, sin
    // decodificar aquí (`Part.inlineData: Blob_2 = { data, mimeType }`,
    // verificado contra el `.d.ts` real del SDK y contra la respuesta real
    // del servidor).
    const parts = message.serverContent?.modelTurn?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        callbacks.onAudio?.(part.inlineData.data, part.inlineData.mimeType ?? "audio/pcm");
      }
    }
  }

  private async executeCall(userId: string, call: FunctionCall) {
    const name = call.name ?? "";
    // Bug real corregido 2026-08-31 (ver `toGeminiParameters`): antes se
    // mandaba `confirmed: false` SIEMPRE, para cualquier tool — dejaba
    // `send_message` (y cualquier otra tool confirmable) en loop infinito
    // de "¿confirmas?" sin poder ejecutarse nunca. Ahora se lee el
    // `confirmed` real que el modelo mande de vuelta (solo existe como
    // parámetro en las tools con `requiresConfirmation`, ver arriba).
    // `activate_emergency_corridor` es la ÚNICA excepción deliberada
    // (ver comentario de clase): activar una emergencia real por voz sigue
    // fuera de alcance a propósito, así que se ignora cualquier `confirmed`
    // que el modelo mande para esa tool específica, pase lo que pase.
    const confirmed = name === "activate_emergency_corridor" ? false : call.args?.["confirmed"] === true;
    const outcome = await this.tools.execute(name, { userId, confirmed }, call.args ?? {});
    return { id: call.id, name, response: { output: outcome } };
  }
}
