# Voice Assistant Reference

## Core rule

The model is a reasoning/router layer, not the business-logic layer.

## Tool examples

Messaging:
- read_message
- read_unread_messages
- send_message
- reply_message
- search_messages
- summarize_conversation

Reminders:
- create_reminder
- create_location_reminder
- list_reminders
- cancel_reminder

Navigation:
- search_place
- calculate_route
- start_navigation
- stop_navigation
- get_eta

Mobility/Emergency:
- get_mobility_alerts
- get_route_risk
- activate_emergency
- cancel_emergency
- complete_emergency

## Tool policy

Every tool declares:
- JSON schema;
- permissions;
- confirmation level;
- audit requirements;
- timeout;
- idempotency behavior.

Do not expose generic arbitrary code execution to the model.

## Confirmation examples

Read message: no confirmation.

Create reminder: no confirmation unless user policy says otherwise.

Send message: configurable confirmation; default confirm for ambiguous/externally consequential actions.

Activate emergency: high/critical policy and verified ambulance authorization.

## Voice session

Voice is activated only during an explicit user session. Handle app lifecycle, reconnects, VAD, interruption, timeouts and session teardown.
