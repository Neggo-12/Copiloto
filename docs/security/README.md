# Security

No hay una auditoría de seguridad formal (`INITIAL_SECURITY_AUDIT.md`) todavía —
se genera en la primera sesión `AUDIT` sobre el backend real, según
`.claude/skills/puntos-movilidad-engineering/SKILL.md`.

Lo ya definido vive en otros documentos por ahora:

- Row Level Security, auth (OTP por celular + verificación de correo), storage con
  signed URLs → `docs/architecture/Especificacion-Backend-Supabase-CoPiloto.md` §1 y §4.
- Reglas globales de seguridad (autenticación, autorización, rate limiting,
  idempotencia, auditoría, mínimo privilegio) → `CLAUDE.md` §8.
- Prioridad de patentar/proteger la propiedad intelectual de la plataforma antes de
  mostrarla públicamente → `docs/product/Ficha-04-CoPiloto.md` §9, punto 6.

Pendiente: definir proveedor de SMS/OTP (Twilio/MessageBird/Vonage) para Supabase Auth.
