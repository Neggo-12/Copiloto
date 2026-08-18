# Quality Gates

## Mandatory before completion

- targeted tests pass;
- lint passes;
- typecheck passes;
- build passes;
- security implications considered;
- migration validated if DB changed;
- docs updated if architecture/contracts changed.

## Critical-flow extra gates

For Voice, Messaging, Location, Emergency and Simulation:

- integration test;
- E2E or replay scenario;
- failure path;
- reconnect/offline behavior;
- permission denial path where applicable;
- telemetry/log verification.

## Emergency-specific safety

Do not launch real-world integration when the simulator still shows unresolved false positives, missed conflicts, authorization bypasses, or uncontrolled alert storms.
