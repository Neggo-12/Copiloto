import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { QUEUE_NAMES } from "../../common/queue/queue-names";
import { EmergencyModule } from "../emergency/emergency.module";
import { LocationModule } from "../location/location.module";
import { NavigationModule } from "../navigation/navigation.module";
import { RouteSessionModule } from "../route-session/route-session.module";
import { VehiclesModule } from "../vehicles/vehicles.module";
import { AlertPolicyService } from "./alert-policy.service";
import { CorridorExpirySweepProcessor } from "./corridor-expiry-sweep.processor";
import { EmergencyCorridorController } from "./emergency-corridor.controller";
import { EmergencyCorridorService } from "./emergency-corridor.service";

@Module({
  // `RouteSessionModule` ya se importaba (lo usa `EmergencyCorridorController`
  // directo); ahora también lo consume `AlertPolicyService.sweepExpired` —
  // mismo módulo, sin import nuevo. `BullModule.registerQueue` para
  // `EMERGENCY_ALERTS` (reservada desde ADR-0008, sin registrar hasta hoy
  // porque nada la consumía) vive aquí porque `CorridorExpirySweepProcessor`
  // — su único consumidor — vive en este módulo. `NavigationModule` es nuevo
  // (2026-09-01): `EmergencyCorridorService.tryReroute` necesita el mismo
  // `ROUTING_PROVIDER` (Google Routes real) que ya usa
  // `POST /navigation/route-session` — no se duplica el binding, se importa
  // el módulo que ya lo expone. Sin ciclo: `NavigationModule` no depende de
  // `EmergencyCorridorModule`.
  imports: [
    EmergencyModule,
    LocationModule,
    NavigationModule,
    RouteSessionModule,
    VehiclesModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.EMERGENCY_ALERTS }),
  ],
  controllers: [EmergencyCorridorController],
  providers: [EmergencyCorridorService, AlertPolicyService, CorridorExpirySweepProcessor],
  // Exportados para que `SimulationModule` (ADR-0022) pueda reusar el
  // Conflict Engine y la Alert Policy REALES en vez de reimplementarlos —
  // antes no hacía falta exportarlos porque nada fuera de este módulo los
  // consumía.
  exports: [EmergencyCorridorService, AlertPolicyService],
})
export class EmergencyCorridorModule {}
