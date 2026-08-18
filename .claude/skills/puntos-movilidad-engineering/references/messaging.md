# Messaging Reference

## Server authority

The server is the source of truth for message state.

## Message identity

Every client send should include a clientMessageId. Persist a server messageId. This enables idempotent retries.

## States

SENT → DELIVERED → READ

Deletion/editing must follow the existing product policy.

## Realtime

Use WebSocket for active sessions.

Use push for background/offline notification.

Do not create a second realtime transport if the repository already has one.

## Media

Prefer signed upload → object storage → message media reference.

Do not route large media payloads through normal JSON API unless the existing design already has a proven reason.

## Resilience

Handle:
- reconnect;
- duplicate sends;
- offline queue;
- message ordering;
- stale sessions;
- push + WS duplicate notifications.
