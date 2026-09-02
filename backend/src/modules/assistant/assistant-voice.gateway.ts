import { Inject, Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Redis } from "ioredis";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import { REDIS_CONNECTION } from "../../common/redis/redis.module";
import { checkSocketRateLimit } from "../../common/rate-limit/socket-rate-limit";
import { resolveWebSocketCorsOrigin } from "../../common/websocket/websocket-cors";
import { GeminiLiveService, type GeminiLiveSessionHandle } from "./gemini-live.service";

interface AuthenticatedSocket extends Socket {
  data: { userId: string; voiceSession?: GeminiLiveSessionHandle };
}

/**
 * Límites reales de esta gateway — ver ADR-0036 (el `APP_GUARD` global de
 * rate limiting no llega a los WebSocket gateways). Cada sesión real de
 * Gemini Live tiene COSTO real, así que el control más importante acá no es
 * "cuántos mensajes por segundo" (el streaming de micrófono real manda
 * varios chunks por segundo de por sí, un límite estricto ahí rompería uso
 * legítimo) sino "cuántas sesiones simultáneas por usuario" — evita que un
 * token filtrado o un cliente roto abra sesiones sin control, cada una
 * facturando de verdad.
 */
const VOICE_TEXT_RATE_LIMIT = 10;
const VOICE_TEXT_RATE_WINDOW_SECONDS = 10;
/** Streaming real de micrófono: varios chunks/segundo es tráfico normal — límite generoso, solo para atajar un cliente roto o malicioso muy por encima de cualquier micrófono real. */
const VOICE_AUDIO_CHUNK_RATE_LIMIT = 50;
const VOICE_AUDIO_CHUNK_RATE_WINDOW_SECONDS = 5;

function voiceTextRateKey(userId: string): string {
  return `ws-rate:voice-text:${userId}`;
}

function voiceAudioChunkRateKey(userId: string): string {
  return `ws-rate:voice-audio-chunk:${userId}`;
}

/**
 * Segundo slice de ADR-0034: expone `GeminiLiveService.startSession()` al
 * frontend real por WebSocket, para "Modo conducción" (micrófono real).
 *
 * REUSE explícito, no invención de un mecanismo nuevo: mismo patrón de auth
 * que `LocationGateway` (token en `handshake.auth.token` →
 * `supabase.auth.getUser(token)`, nunca confiar en un userId mandado por el
 * cliente) y mismo criterio de namespace propio (`/assistant-voice`, no
 * mezclarse con `/location`).
 *
 * Una sesión Gemini Live real por socket conectado — se abre en
 * `handleConnection` y se cierra en `handleDisconnect` o si Gemini cierra
 * primero (`onClose`/`onError` del adapter). Sin cola ni buffer de chunks
 * de audio: se reenvían tal cual, en el orden en que llegan, tanto de
 * cliente→Gemini como de Gemini→cliente — la app decide cómo bufferear
 * para reproducir suave del lado del navegador.
 *
 * `voice:ready` es obligatorio esperar del lado del cliente antes de mandar
 * `voice:text`/`voice:audio-chunk` — bug real encontrado con
 * `verify-voice-gateway.ts`: el evento `connect` del cliente dispara al
 * terminar el handshake de transporte, ANTES de que `handleConnection`
 * (dos `await` reales: verificar token, abrir sesión Gemini) termine. Sin
 * este handshake explícito, un mensaje mandado justo al conectar se pierde
 * en silencio.
 *
 * Pendiente, honesto (ver ADR-0034): esto solo se probó con el flujo de
 * texto (`voice:text`, útil para depurar sin micrófono real). El flujo de
 * audio real (`voice:audio-chunk`) todavía no se probó con un micrófono
 * real — requiere el frontend de "Modo conducción", que no existe aún.
 *
 * A lo sumo UNA sesión real activa por usuario (ver ADR-0036, Fase 8) — si
 * el mismo usuario abre una conexión nueva (reconexión real por red
 * perdida/app en background, o una pestaña nueva) mientras ya tenía una
 * sesión Gemini Live real abierta, se cierra la VIEJA antes de abrir la
 * nueva. Sin esto, un usuario podía acumular sesiones reales huérfanas
 * (cada una con costo real) sin límite — mismo criterio de "no gastar de
 * más" que ya aplica `REROUTE_COOLDOWN_SECONDS` en el corredor de
 * emergencia, ahora aplicado al costo real de Gemini Live.
 */
@WebSocketGateway({ namespace: "assistant-voice", cors: { origin: resolveWebSocketCorsOrigin() } })
export class AssistantVoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AssistantVoiceGateway.name);
  /** Socket con la sesión real activa de cada usuario — en memoria a propósito: la sesión Gemini Live es un objeto vivo atado a ESTE proceso, no algo que sobreviva un reinicio ni que deba compartirse entre instancias (razón real distinta a por qué otros estados sí usan Redis en este proyecto). */
  private readonly activeSocketByUser = new Map<string, AuthenticatedSocket>();

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly geminiLive: GeminiLiveService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    if (!this.geminiLive.configured) {
      this.logger.warn(`Conexión rechazada (Gemini Live sin configurar): ${client.id}`);
      client.emit("voice:error", { message: "Asistente de voz no configurado en el servidor" });
      client.disconnect(true);
      return;
    }

    const token = client.handshake.auth.token as string | undefined;
    if (!token) {
      this.logger.warn(`Conexión rechazada (sin token): ${client.id}`);
      client.emit("voice:error", { message: "Falta token de autenticación" });
      client.disconnect(true);
      return;
    }

    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) {
      this.logger.warn(`Conexión rechazada (token inválido): ${client.id}`);
      client.emit("voice:error", { message: "Token inválido o expirado" });
      client.disconnect(true);
      return;
    }

    const userId = data.user.id;
    const authed = client as AuthenticatedSocket;
    authed.data = { userId };

    // Cierra la sesión real VIEJA de este mismo usuario, si había una — ver
    // el comentario de clase (a lo sumo una sesión real activa por usuario).
    const previousSocket = this.activeSocketByUser.get(userId);
    if (previousSocket && previousSocket.connected) {
      this.logger.log(`Sesión de voz previa de ${userId} reemplazada por una conexión nueva (socket viejo=${previousSocket.id}, nuevo=${client.id})`);
      previousSocket.data?.voiceSession?.close();
      previousSocket.emit("voice:closed", { reason: "replaced_by_new_connection" });
      previousSocket.disconnect(true);
    }

    const session = await this.geminiLive.startSession(userId, {
      onText: (text) => client.emit("voice:text", { text }),
      onAudio: (base64Data, mimeType) => client.emit("voice:audio-chunk", { data: base64Data, mimeType }),
      // Barge-in real (Modo conducción manos-libres) — ver comentario en
      // `GeminiLiveCallbacks.onInterrupted`. El cliente usa esto para cortar
      // YA el audio que ya estaba reproduciendo de la respuesta anterior.
      onInterrupted: () => client.emit("voice:interrupted", {}),
      onError: (message) => client.emit("voice:error", { message }),
      onClose: () => {
        client.emit("voice:closed", {});
        client.disconnect(true);
      },
    });

    if (!session) {
      // No debería pasar (ya se validó `configured` arriba), pero por si
      // `startSession` retorna null por otra razón futura, no dejar el
      // socket abierto sin sesión real detrás.
      client.emit("voice:error", { message: "No se pudo abrir la sesión de voz" });
      client.disconnect(true);
      return;
    }

    authed.data.voiceSession = session;
    this.activeSocketByUser.set(userId, authed);
    this.logger.log(`Sesión de voz abierta (userId=${userId}, socket=${client.id})`);
    // Bug real encontrado y corregido (mismo tipo que el de TDZ en
    // GeminiLiveService, pero a nivel de WebSocket): el evento `connect` del
    // CLIENTE dispara en cuanto termina el handshake de transporte, que
    // ocurre ANTES de que este `handleConnection` (dos `await` reales:
    // verificar el token, después abrir la sesión de Gemini) termine. Si el
    // cliente manda `voice:text`/`voice:audio-chunk` justo al conectar, el
    // mensaje llegaba con `client.data.voiceSession` todavía `undefined` y
    // se perdía en silencio (optional chaining no truena, pero tampoco
    // manda nada) — confirmado real con `verify-voice-gateway.ts` (conectó,
    // mandó el turno, nunca llegó respuesta). Fix: un evento explícito de
    // "listo" — el cliente debe esperarlo antes de mandar nada.
    client.emit("voice:ready", {});
  }

  handleDisconnect(client: Socket): void {
    const authed = client as AuthenticatedSocket;
    const session = authed.data?.voiceSession;
    session?.close();
    // Solo se borra del mapa si ESTE socket sigue siendo el activo de ese
    // usuario — evita una condición de carrera real: si el usuario ya
    // reconectó (socket nuevo ya registrado en `handleConnection`), el
    // `disconnect` tardío del socket VIEJO no debe borrar la entrada del
    // socket NUEVO.
    const userId = authed.data?.userId;
    if (userId && this.activeSocketByUser.get(userId) === authed) {
      this.activeSocketByUser.delete(userId);
    }
  }

  /** Turno de texto — útil para depurar sin micrófono real (mismo camino que `verify-gemini-live.ts`, ahora accesible por WS). Rate limit real (ADR-0036): descarta en silencio por encima del límite, sin cerrar el socket. */
  @SubscribeMessage("voice:text")
  async handleText(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { text: string }): Promise<void> {
    const userId = client.data?.userId;
    if (userId) {
      const withinRate = await checkSocketRateLimit(this.redis, voiceTextRateKey(userId), VOICE_TEXT_RATE_LIMIT, VOICE_TEXT_RATE_WINDOW_SECONDS);
      if (!withinRate) {
        this.logger.warn(`voice:text de ${userId} descartado por rate limit real (>${VOICE_TEXT_RATE_LIMIT}/${VOICE_TEXT_RATE_WINDOW_SECONDS}s)`);
        return;
      }
    }
    client.data?.voiceSession?.sendText(body.text);
  }

  /** Chunk real de audio del micrófono (PCM 16-bit mono, base64) + su `mimeType` real (debe incluir la tasa de muestreo, ej. `"audio/pcm;rate=16000"`). Rate limit real (ADR-0036), generoso a propósito — un micrófono real manda varios chunks/segundo. */
  @SubscribeMessage("voice:audio-chunk")
  async handleAudioChunk(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { data: string; mimeType: string }): Promise<void> {
    const userId = client.data?.userId;
    if (userId) {
      const withinRate = await checkSocketRateLimit(this.redis, voiceAudioChunkRateKey(userId), VOICE_AUDIO_CHUNK_RATE_LIMIT, VOICE_AUDIO_CHUNK_RATE_WINDOW_SECONDS);
      if (!withinRate) {
        this.logger.warn(`voice:audio-chunk de ${userId} descartado por rate limit real (>${VOICE_AUDIO_CHUNK_RATE_LIMIT}/${VOICE_AUDIO_CHUNK_RATE_WINDOW_SECONDS}s)`);
        return;
      }
    }
    client.data?.voiceSession?.sendAudioChunk(body.data, body.mimeType);
  }

  /** El usuario soltó el botón de hablar / el VAD del frontend detectó silencio. */
  @SubscribeMessage("voice:audio-end")
  handleAudioEnd(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.data?.voiceSession?.endAudioStream();
  }
}
