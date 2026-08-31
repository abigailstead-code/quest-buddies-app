---
name: OpenAPI Zod compatibility
description: Compatibility constraint for generated request schemas in this workspace
---

Generated Zod schemas in this workspace use Zod 3.25, where generated `zod.int()` is unavailable. Prefer numeric OpenAPI validation plus explicit server-side whole-number checks when a generated integer schema would emit that helper.

**Why:** Code generation failed when a request field used OpenAPI `integer`, while the installed Zod generator emitted an unsupported helper.

**How to apply:** Check generated library typechecks immediately after OpenAPI changes; keep generated-schema-compatible validation in the route handler when necessary.