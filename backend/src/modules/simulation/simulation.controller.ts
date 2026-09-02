import { Controller, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { SupabaseAuthGuard } from "../../common/guards/supabase-auth.guard";
import { SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES } from "./scenarios/scenario-1-single-ambulance-10-vehicles";
import { SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES } from "./scenarios/scenario-2-single-ambulance-100-vehicles";
import { SCENARIO_3_THREE_AMBULANCES_SIMULTANEOUS } from "./scenarios/scenario-3-three-ambulances-simultaneous";
import { SCENARIO_4_VEHICLE_OFF_ROUTE } from "./scenarios/scenario-4-vehicle-off-route";
import { SCENARIO_5_GPS_NOISE } from "./scenarios/scenario-5-gps-noise";
import { SimulationEngineService } from "./simulation.engine";
import type { CompoundSimulationScenario, SimulationScenario } from "./simulation.types";

/** Registro de escenarios disponibles — se agrega una entrada por cada nuevo escenario de Etapa 7 (roadmap) a medida que se construyen, no todos de una vez (regla del proyecto: sin complejidad sin evidencia). */
const SCENARIOS: Record<string, SimulationScenario> = {
  [SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES.name]: SCENARIO_1_SINGLE_AMBULANCE_10_VEHICLES,
  [SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES.name]: SCENARIO_2_SINGLE_AMBULANCE_100_VEHICLES,
  [SCENARIO_4_VEHICLE_OFF_ROUTE.name]: SCENARIO_4_VEHICLE_OFF_ROUTE,
  [SCENARIO_5_GPS_NOISE.name]: SCENARIO_5_GPS_NOISE,
};

/** Registro separado para escenarios de VARIAS ambulancias (ver `CompoundSimulationScenario`) — mismo criterio de "uno a la vez" que `SCENARIOS`. */
const COMPOUND_SCENARIOS: Record<string, CompoundSimulationScenario> = {
  [SCENARIO_3_THREE_AMBULANCES_SIMULTANEOUS.name]: SCENARIO_3_THREE_AMBULANCES_SIMULTANEOUS,
};

/**
 * Protegido con el mismo guard que el resto del backend — no expone datos de
 * terceros (los "vehículos" son sintéticos, IDs fijos que no corresponden a
 * ningún usuario real), pero correr un escenario sí tiene costo real
 * (múltiples escrituras a Redis), así que no queda abierto sin autenticar.
 * Sigue sin UI propia en `proyecto-mensajeria` (a diferencia de
 * `EmergenciaScreen`/`AdminAmbulanciasScreen`, que sí llaman al backend real
 * — ver ADR-0041) — este endpoint sigue siendo para verificación de
 * ingeniería/QA (ver ADR-0022), igual que `GET /assistant/tools`.
 */
@Controller("simulation")
@UseGuards(SupabaseAuthGuard)
export class SimulationController {
  constructor(private readonly engine: SimulationEngineService) {}

  /** Rate limit mucho más estricto que el default global (5/min en vez de 60/min): cada corrida hace múltiples escrituras reales a Redis, no es una lectura barata. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("scenarios/:name/run")
  async run(@Param("name") name: string) {
    const scenario = SCENARIOS[name];
    if (!scenario) {
      throw new NotFoundException(
        `Escenario "${name}" no existe. Disponibles: ${Object.keys(SCENARIOS).join(", ")}`,
      );
    }
    return this.engine.run(scenario);
  }

  /** Mismo rate limit estricto que `run` — cada corrida compuesta hace 3x (o más) las escrituras reales a Redis de una sola. */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("compound-scenarios/:name/run")
  async runCompound(@Param("name") name: string) {
    const scenario = COMPOUND_SCENARIOS[name];
    if (!scenario) {
      throw new NotFoundException(
        `Escenario compuesto "${name}" no existe. Disponibles: ${Object.keys(COMPOUND_SCENARIOS).join(", ")}`,
      );
    }
    return this.engine.runConcurrent(scenario.scenarios);
  }
}
