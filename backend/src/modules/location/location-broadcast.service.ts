import { Injectable, Logger } from "@nestjs/common";
import type { Server } from "socket.io";

/**
 * Puente para mandar eventos server → cliente específico por `userId`, sin
 * que quien dispara el evento (ej. `AlertPolicyService`, en otro módulo)
 * necesite conocer `LocationGateway` ni Socket.IO directamente — solo este
 * contrato pequeño. `LocationGateway` registra su instancia de `Server` aquí
 * al arrancar (`OnGatewayInit`); todo lo demás solo llama `notify()`.
 *
 * Reusa el namespace `/location` que ya existe (cada socket autenticado se
 * une a una "room" con su propio `userId` en `handleConnection`) — no se
 * abre un canal nuevo solo para alertas.
 */
@Injectable()
export class LocationBroadcastService {
  private readonly logger = new Logger(LocationBroadcastService.name);
  private server: Server | null = null;

  registerServer(server: Server): void {
    this.server = server;
  }

  notify(userId: string, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`notify(${userId}, ${event}) ignorado — servidor WebSocket todavía no registrado`);
      return;
    }
    this.server.to(userId).emit(event, payload);
  }
}
