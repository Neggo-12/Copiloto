# Product Scope

## MVP

1. Existing messaging platform stabilized.
2. Voice assistant with explicit active voice session.
3. Driving Mode.
4. GPS/permission flow.
5. Navigation.
6. Location reminders.
7. Emergency Corridor.
8. Emergency simulation.
9. Metrics/observability.

## Explicit voice behavior

The app does NOT listen continuously in background.

Expected flow:

`Open app → activate Driving Mode → location permission → active voice session → VAD → user speaks → Realtime/tool → response`

## Location reminder example

"Recuérdame comprar el cargador cuando pase por Laureles."

Expected:

`intent → place/geocode → geofence → active reminder → trigger → notification/voice`

## Emergency example

Authorized ambulance:

`activate → destination → route → location stream → corridor → conflict → alerts → passed/completed`

Cars: visual + voice.

Motorcycles: voice-first.

## Future

Mobility Intelligence → Traffic Prediction → Priority Decision → Signal Integration.

Do not implement real signal control in MVP.
