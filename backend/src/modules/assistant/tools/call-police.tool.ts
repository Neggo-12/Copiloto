import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS_CONNECTION } from "../../../common/redis/redis.module";
import { LocationStateService } from "../../location/location-state.service";
import { EmergencyIncidentsService } from "../../emergency/emergency-incidents.service";
import type { AssistantTool, ToolExecutionContext, ToolOutcome } from "../assistant.types";

/**
 * Ventana real de "confirmación pendiente" — 25s. Ver comentario largo en
 * `execute()`: es una red de seguridad adicional para cuando el modelo de
 * voz no manda `confirmed: true` de forma confiable después de un "sí"
 * verbal, NO un reemplazo del mecanismo de confirmación real.
 */
const PENDING_CONFIRMATION_TTL_SECONDS = 25;

/**
 * "Copiloto, llama a la policía" — SOS real (ver docs/decisions/README.md,
 * decisión (33)). El paquete de datos del incidente (ID, usuario
 * autenticado, dispositivo, ubicación, timestamp, tipo de emergencia, nivel
 * de confianza) ya está definido en la documentación PROPIA de "Copiloto
 * versión 2" — no depende de ninguna API pública de NUSE/Línea 123, que no
 * existe documentada (confirmado buscando explícitamente, ver esa misma
 * decisión).
 *
 * `requiresConfirmation = true`, mismo criterio que
 * `ActivateEmergencyCorridorTool`: es la acción de mayor riesgo posible del
 * registro — un "sí" mal interpretado por STT en la primera pasada NUNCA
 * debe crear un incidente real.
 *
 * Alcance real de este MVP, a propósito: NO llama a ningún número de
 * teléfono ni a ninguna API de policía — eso requiere un canal
 * institucional autorizado que hoy no existe (documentado así desde el
 * origen en "Copiloto versión 2", no es un pendiente nuevo). Lo que SÍ hace
 * de verdad: crea el incidente en Postgres con los datos REALES de la
 * cuenta (nombre/teléfono/correo, ubicación actual) y lo deja visible para
 * el administrador vía `GET /emergency/admin/incidents` (mismo patrón real
 * ya usado para verificar ambulancias, `EmergencyAdminController`).
 */
@Injectable()
export class CallPoliceTool implements AssistantTool {
  name = "activate_police_sos";
  description =
    "Activa una alerta SOS real hacia la policía: crea un incidente con la ubicación y los datos reales de la cuenta del usuario. Usar SOLO cuando el usuario pida ayuda policial de forma clara e inequívoca (ej. 'llama a la policía', 'necesito ayuda, hay un asalto').";
  requiresConfirmation = true;
  parameters = {
    type: "object" as const,
    properties: {},
    required: [],
  };

  constructor(
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
    private readonly locationState: LocationStateService,
    private readonly incidents: EmergencyIncidentsService,
  ) {}

  private pendingConfirmationKey(userId: string): string {
    return `sos:pending_confirm:${userId}`;
  }

  async execute(ctx: ToolExecutionContext, _args: Record<string, unknown>): Promise<ToolOutcome> {
    const current = await this.locationState.getCurrent(ctx.userId);
    if (!current) {
      return {
        status: "error",
        message: "No tengo tu ubicación actual — necesito al menos un reporte de GPS antes de poder pedir ayuda.",
      };
    }

    const pendingKey = this.pendingConfirmationKey(ctx.userId);

    if (!ctx.confirmed) {
      // Caso real reportado en pruebas (2026-09-03): Gemini Live no siempre
      // vuelve a mandar `confirmed: true` de forma confiable después de que
      // la persona diga "sí" en voz alta — es un riesgo de confiabilidad del
      // modelo, no un bug determinístico de este código (revisado a fondo en
      // `gemini-live.service.ts`/`assistant-tools.service.ts`, ver
      // docs/decisions/README.md). Red de seguridad: si YA había una ventana
      // de confirmación pendiente abierta (`needs_confirmation` disparado
      // hace menos de 25s), un segundo disparo REAL de esta misma tool en ese
      // lapso se trata como la confirmación — la persona ya pidió ayuda dos
      // veces en segundos, eso es señal suficiente en una emergencia real, y
      // es más seguro que dejarla atrapada repitiendo "sí" sin efecto.
      const alreadyPending = await this.redis.get(pendingKey);
      if (!alreadyPending) {
        await this.redis.set(pendingKey, "1", "EX", PENDING_CONFIRMATION_TTL_SECONDS);
        return {
          status: "needs_confirmation",
          summary: "Vas a activar una alerta real de emergencia policial con tu ubicación actual. ¿Confirmas?",
        };
      }
      // alreadyPending === true: cae al flujo normal de abajo y crea el incidente de verdad.
    }

    await this.redis.del(pendingKey);

    const incident = await this.incidents.createPoliceIncident({
      userId: ctx.userId,
      latitude: current.location.latitude,
      longitude: current.location.longitude,
      locationAccuracyMeters: current.location.accuracy,
      confidenceLevel: "alta",
    });

    return {
      status: "ok",
      data: {
        incidentId: incident.id,
        status: incident.status,
      },
    };
  }
}
