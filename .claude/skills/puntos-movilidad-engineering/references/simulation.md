# Simulation Reference

## Goal

Enable safe, repeatable testing before real-world pilots.

## Core entities

Simulation
VirtualVehicle
VirtualAmbulance
VirtualDriver
VirtualRoute
SimulationEvent
SimulationStep

## Scenarios

- 1 ambulance + 10 drivers
- 1 ambulance + 100 drivers
- 3 concurrent ambulances
- noisy GPS
- stale GPS
- route deviation
- driver enters/exits corridor
- WebSocket reconnect
- no network
- emergency cancellation
- emergency completion
- overlapping corridors

## Determinism

Support fixed random seed and replayable event streams.

## Metrics

- detection latency;
- conflict precision;
- missed conflicts;
- false alerts;
- alert delivery latency;
- recovery after stale GPS;
- resource use.

Critical algorithms must have unit tests plus simulation coverage.
