import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { LocationRemindersService } from "./location-reminders.service";
import { NoteReminderSchedulerService } from "./note-reminder-scheduler.service";
import { ReminderCacheService } from "./reminder-cache.service";

interface CreateReminderBody {
  kind?: "location" | "note";
  message: string;
  title?: string;
  isTask?: boolean;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
  label?: string;
  /** Solo aplica a `kind: "note"` (ADR-0030) — ISO 8601. */
  remindAt?: string | null;
}

interface ScheduleReminderBody {
  /** ISO 8601, o `null` para quitar la hora fija sin borrar la nota. */
  remindAt: string | null;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

interface UpdateTextBody {
  title?: string | null;
  message?: string;
}

interface SetTaskBody {
  isTask: boolean;
}

interface SetCompletedBody {
  completed: boolean;
}

interface SetArchivedBody {
  archived: boolean;
}

/**
 * Sección unificada de recordatorios/notas/tareas (ADR-0023 — antes dos
 * capacidades separadas: "Recordatorios" por ubicación aquí, y "Notas" 100%
 * local en el frontend sin backend). `kind: "location"` recibe coordenadas
 * YA resueltas, no una dirección de texto — resolver "Belén, Medellín" a
 * coordenadas sigue siendo responsabilidad del llamador vía
 * `GET /navigation/geocode` (ADR-0010). `kind: "note"` (default si no se
 * envía `kind`, para no romper al futuro tool de voz `create_location_reminder`
 * de Fase 6) no necesita coordenadas.
 */
@Controller("location-reminders")
@UseGuards(SupabaseAuthGuard)
export class LocationRemindersController {
  constructor(
    private readonly reminders: LocationRemindersService,
    private readonly cache: ReminderCacheService,
    private readonly noteScheduler: NoteReminderSchedulerService,
  ) {}

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.reminders.list(request.userId);
  }

  @Post()
  async create(@Req() request: AuthenticatedRequest, @Body() body: CreateReminderBody) {
    if (!body?.message?.trim()) {
      throw new BadRequestException("message es requerido.");
    }

    const kind = body.kind ?? "location";

    if (kind === "location") {
      if (typeof body.latitude !== "number" || typeof body.longitude !== "number") {
        throw new BadRequestException("latitude y longitude son requeridos y deben ser numéricos.");
      }
      if (body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
        throw new BadRequestException("latitude/longitude fuera de rango.");
      }
      if (body.radiusMeters !== undefined && (typeof body.radiusMeters !== "number" || body.radiusMeters <= 0)) {
        throw new BadRequestException("radiusMeters debe ser un número positivo.");
      }

      const created = await this.reminders.create(request.userId, {
        kind: "location",
        message: body.message.trim(),
        latitude: body.latitude,
        longitude: body.longitude,
        radiusMeters: body.radiusMeters,
        label: body.label ?? null,
      });
      await this.cache.invalidate(request.userId);
      return created;
    }

    if (kind !== "note") {
      throw new BadRequestException('kind debe ser "location" o "note".');
    }

    if (body.remindAt != null && !isValidIsoDate(body.remindAt)) {
      throw new BadRequestException("remindAt debe ser una fecha ISO 8601 válida.");
    }

    const created = await this.reminders.create(request.userId, {
      kind: "note",
      message: body.message.trim(),
      title: body.title?.trim() || null,
      isTask: body.isTask ?? false,
      remindAt: body.remindAt ?? null,
    });

    if (created.remindAt) {
      await this.noteScheduler.schedule(request.userId, created.id, created.remindAt);
    }

    return created;
  }

  @Patch(":id")
  async updateText(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: UpdateTextBody) {
    if (body.message !== undefined && !body.message.trim()) {
      throw new BadRequestException("message no puede quedar vacío.");
    }
    await this.reminders.updateText(request.userId, id, body);
    return { updated: true };
  }

  @Patch(":id/task")
  async setTask(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: SetTaskBody) {
    if (typeof body.isTask !== "boolean") {
      throw new BadRequestException("isTask debe ser booleano.");
    }
    await this.reminders.setIsTask(request.userId, id, body.isTask);
    return { updated: true };
  }

  @Patch(":id/complete")
  async setCompleted(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: SetCompletedBody) {
    if (typeof body.completed !== "boolean") {
      throw new BadRequestException("completed debe ser booleano.");
    }
    await this.reminders.setTaskCompleted(request.userId, id, body.completed);
    // Una tarea completada ya no debe avisar a su hora fija — el guard
    // real (`completed_at IS NULL`) vive en `markNoteReminderTriggered`;
    // esto solo evita dejar un job vivo sin necesidad en Redis.
    if (body.completed) {
      await this.noteScheduler.cancel(id);
    }
    return { updated: true };
  }

  @Patch(":id/archive")
  async setArchived(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: SetArchivedBody) {
    if (typeof body.archived !== "boolean") {
      throw new BadRequestException("archived debe ser booleano.");
    }
    await this.reminders.setArchived(request.userId, id, body.archived);
    if (body.archived) {
      await this.noteScheduler.cancel(id);
    }
    return { updated: true };
  }

  /** Programa, reprograma o quita (`remindAt: null`) la hora fija de aviso de una nota. */
  @Patch(":id/remind-at")
  async scheduleReminder(@Req() request: AuthenticatedRequest, @Param("id") id: string, @Body() body: ScheduleReminderBody) {
    if (body.remindAt != null && !isValidIsoDate(body.remindAt)) {
      throw new BadRequestException("remindAt debe ser una fecha ISO 8601 válida o null.");
    }

    const updated = await this.reminders.scheduleReminder(request.userId, id, body.remindAt ?? null);

    if (updated.remindAt) {
      await this.noteScheduler.schedule(request.userId, updated.id, updated.remindAt);
    } else {
      await this.noteScheduler.cancel(updated.id);
    }

    return updated;
  }

  /** Cancela un recordatorio de ubicación pendiente (no borra su historial). También quita el job de hora fija si la fila era una nota (no-op si no tenía). */
  @Delete(":id")
  async cancel(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    await this.reminders.cancel(request.userId, id);
    await this.cache.invalidate(request.userId);
    await this.noteScheduler.cancel(id);
    return { cancelled: true };
  }

  /** Borrado permanente — solo notas/tareas. */
  @Delete(":id/permanent")
  async remove(@Req() request: AuthenticatedRequest, @Param("id") id: string) {
    await this.reminders.remove(request.userId, id);
    await this.noteScheduler.cancel(id);
    return { removed: true };
  }
}
