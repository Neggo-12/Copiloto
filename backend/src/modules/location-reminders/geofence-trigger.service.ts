import { Injectable, Logger } from "@nestjs/common";
import { haversineMeters } from "../../common/geo/haversine";
import type { LatLng } from "../../common/geo/types";
import { LocationRemindersService } from "./location-reminders.service";
import { ReminderCacheService } from "./reminder-cache.service";

export interface TriggeredReminder {
  id: string;
  message: string;
  distanceMeters: number;
}

/**
 * Evalúa, en cada `location:update` de un usuario, si su posición actual
 * entró al radio de alguno de sus recordatorios pendientes — misma pieza
 * matemática (Haversine) que `route-deviation.ts` y
 * `EmergencyCorridorService`, reutilizada, no reimplementada.
 *
 * Entrega deliberadamente NO usa `LocationBroadcastService`: quien reporta
 * la ubicación es el propio dueño del recordatorio, en el mismo socket que
 * ya está mandando `location:update` — el resultado va en el ack de esa
 * misma llamada (`LocationGateway.handleLocationUpdate`, campo
 * `remindersTriggered`), igual que ya se hace con `route`. Usar el
 * mecanismo de broadcast entre módulos (pensado para que OTRO usuario, la
 * ambulancia, notifique a un tercero) sería una dependencia cruzada
 * innecesaria aquí, y crearía un ciclo de módulos
 * (`LocationModule` ↔ `LocationRemindersModule`) sin necesidad real.
 *
 * Sin recordatorios recurrentes: un recordatorio se dispara una sola vez
 * (pasa a `triggered`, idempotente por el `.eq("status","pending")` en el
 * UPDATE) y no se reevalúa. No se pidió repetición, y no hay evidencia de
 * necesidad — agregarla ahora sería complejidad sin evidencia.
 */
@Injectable()
export class GeofenceTriggerService {
  private readonly logger = new Logger(GeofenceTriggerService.name);

  constructor(
    private readonly cache: ReminderCacheService,
    private readonly reminders: LocationRemindersService,
  ) {}

  async checkAndTrigger(userId: string, current: LatLng): Promise<TriggeredReminder[]> {
    const pending = await this.cache.getPending(userId);
    if (pending.length === 0) return [];

    const triggered: TriggeredReminder[] = [];

    for (const reminder of pending) {
      const distanceMeters = haversineMeters(current, { latitude: reminder.latitude, longitude: reminder.longitude });
      if (distanceMeters <= reminder.radiusMeters) {
        await this.reminders.markTriggered(userId, reminder.id);
        triggered.push({ id: reminder.id, message: reminder.message, distanceMeters: Math.round(distanceMeters) });
      }
    }

    if (triggered.length > 0) {
      await this.cache.refresh(userId);
      this.logger.log(`Usuario ${userId}: ${triggered.length} recordatorio(s) disparado(s)`);
    }

    return triggered;
  }
}
