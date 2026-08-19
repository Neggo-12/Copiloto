import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { SupabaseAuthGuard, type AuthenticatedRequest } from "../../common/guards/supabase-auth.guard";
import { LocationStateService } from "./location-state.service";
import type { LocationState } from "./location.types";

@Controller("location")
@UseGuards(SupabaseAuthGuard)
export class LocationController {
  constructor(private readonly locationState: LocationStateService) {}

  /** Última posición conocida del usuario autenticado — `null` si nunca reportó o si Redis ya la expiró. */
  @Get("me")
  async myCurrentLocation(@Req() request: AuthenticatedRequest): Promise<LocationState | null> {
    return this.locationState.getCurrent(request.userId);
  }
}
