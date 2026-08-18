# Provider Reference — Verify Before Coding

Use official documentation first.

## OpenAI

Home: https://developers.openai.com/
Realtime: https://developers.openai.com/api/docs/guides/realtime
Function calling: https://developers.openai.com/api/docs/guides/function-calling
Pricing: https://openai.com/api/pricing/

Use for voice/realtime/tool use. Verify current model/API details before implementation because APIs change.

## Google Maps Platform

Home: https://developers.google.com/maps
Routes: https://developers.google.com/maps/documentation/routes
Geocoding: https://developers.google.com/maps/documentation/geocoding
Places: https://developers.google.com/maps/documentation/places/web-service
Navigation Android: https://developers.google.com/maps/documentation/navigation/android-sdk/overview
Navigation iOS: https://developers.google.com/maps/documentation/navigation/ios-sdk/overview
Pricing: https://developers.google.com/maps/billing-and-pricing/overview

Always use adapters. Do not scatter Google-specific code throughout domain modules.

## Firebase

FCM: https://firebase.google.com/docs/cloud-messaging

## Apple

Core Location: https://developer.apple.com/documentation/corelocation
Authorization: https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services

## Android

Location permissions: https://developer.android.com/develop/sensors-and-location/location/permissions

## NestJS

Docs: https://docs.nestjs.com/
WebSockets: https://docs.nestjs.com/websockets/gateways

## PostgreSQL/PostGIS

PostgreSQL: https://www.postgresql.org/docs/
PostGIS: https://postgis.net/documentation/manual/

## Redis

Docs: https://redis.io/docs/
Geospatial: https://redis.io/docs/latest/develop/data-types/geospatial/

## BullMQ

Docs: https://docs.bullmq.io/

## Observability

Sentry: https://docs.sentry.io/
OpenTelemetry JS: https://opentelemetry.io/docs/languages/js/

## Rule

Before changing an external integration:
1. inspect current package/version;
2. read current official docs;
3. verify breaking changes/limits;
4. update adapter;
5. test;
6. document version/date.
