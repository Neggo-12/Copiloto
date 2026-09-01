import { Inject, Logger } from "@nestjs/common";
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Socket } from "socket.io";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ADMIN_CLIENT } from "../../common/supabase/supabase.module";
import { GeminiLiveService, type GeminiLiveSessionHandle } from "./gemini-live.service";

interface AuthenticatedSocket extends Socket {
  data: { userId: string; voiceSession?: GeminiLiveSessionHandle };
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
 */
@WebSocketGateway({ namespace: "assistant-voice", cors: { origin: "*" } })
export class AssistantVoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(AssistantVoiceGateway.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT) private readonly supabase: SupabaseClient,
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
    const session = (client as AuthenticatedSocket).data?.voiceSession;
    session?.close();
  }

  /** Turno de texto — útil para depurar sin micrófono real (mismo camino que `verify-gemini-live.ts`, ahora accesible por WS). */
  @SubscribeMessage("voice:text")
  handleText(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { text: string }): void {
    client.data?.voiceSession?.sendText(body.text);
  }

  /** Chunk real de audio del micrófono (PCM 16-bit mono, base64) + su `mimeType` real (debe incluir la tasa de muestreo, ej. `"audio/pcm;rate=16000"`). */
  @SubscribeMessage("voice:audio-chunk")
  handleAudioChunk(@ConnectedSocket() client: AuthenticatedSocket, @MessageBody() body: { data: string; mimeType: string }): void {
    client.data?.voiceSession?.sendAudioChunk(body.data, body.mimeType);
  }

  /** El usuario soltó el botón de hablar / el VAD del frontend detectó silencio. */
  @SubscribeMessage("voice:audio-end")
  handleAudioEnd(@ConnectedSocket() client: AuthenticatedSocket): void {
    client.data?.voiceSession?.endAudioStream();
  }
}
