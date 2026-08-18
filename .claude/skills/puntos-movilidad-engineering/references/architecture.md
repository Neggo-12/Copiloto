# Architecture Reference

## Target architecture

Modular monolith:

```text
Mobile
  ├── Messaging
  ├── Assistant
  ├── Driving Mode
  ├── Location
  ├── Navigation
  ├── Reminders
  ├── Emergency
  └── Mobility
        ↓
NestJS API + WebSocket
        ↓
Modules:
identity users devices contacts messaging media notifications assistant reminders location maps navigation emergency mobility traffic audit simulation
        ↓
PostgreSQL + PostGIS
Redis
Object Storage
```

## Domain boundaries

`identity`: authentication, roles, sessions.

`users/devices`: user profile, vehicle/device registration.

`messaging`: conversations, messages, delivery/read, media references.

`assistant`: voice session, tools, context, confirmations.

`reminders`: time and location reminders.

`location`: permission-aware location sessions, validation, current position.

`maps/navigation`: provider-neutral routing, geocoding, places, navigation adapters.

`emergency`: verified emergency vehicle, emergency state machine, route, corridor, conflict, alerts.

`mobility`: mobility events, heavy vehicles, route impacts.

`traffic`: historical observations and later prediction.

`simulation`: virtual vehicles and deterministic scenarios.

`audit`: security/business event trace.

## State responsibilities

PostgreSQL/PostGIS = durable source of truth.

Redis = current location/presence/cache/realtime state/queues.

Object storage = media.

Never treat Redis as permanent history.

## No premature distributed architecture

Avoid microservices/Kafka/Kubernetes unless measured requirements justify them.
