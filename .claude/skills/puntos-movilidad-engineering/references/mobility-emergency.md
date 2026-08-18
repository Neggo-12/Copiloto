# Mobility & Emergency Reference

## Emergency corridor

Do NOT use a simple radius around the ambulance.

Pipeline:

`route geometry → route segments → dynamic buffer → candidate drivers → conflict detection → alert policy`

## Candidate selection

Use:
- distance to corridor;
- heading;
- speed;
- route segment;
- estimated time to conflict;
- stale-location status.

Potential states:

`NO_CONFLICT | POTENTIAL_CONFLICT | ACTIVE_CONFLICT | PASSED`

## Alert policy

Levels:

`INFO | WARNING | CRITICAL`

Never send a new push for every location update. Deduplicate and use cooldown/escalation.

## Mobility events

Future heavy vehicle event fields may include:

- vehicle type;
- route geometry;
- start/end time;
- confidence;
- expected impact.

Do not claim congestion as fact when the model only predicts risk.

## Future signal control

Use an interface:

`SignalProvider`

with simulation first. Never connect experimental code directly to municipal infrastructure.
