# Workflow Reference

## Workflow A — Feature

1. classify request;
2. locate existing implementation;
3. inspect tests/contracts;
4. read only relevant reference;
5. write a compact plan;
6. implement vertical slice;
7. run targeted checks;
8. run broader checks proportional to risk;
9. summarize diff and validation.

## Workflow B — Bug

1. reproduce;
2. capture exact error;
3. locate root cause;
4. add/adjust regression test;
5. fix minimum surface;
6. rerun regression;
7. inspect diff.

Never hide errors by broad catch blocks or disabling tests.

## Workflow C — Provider/API change

1. inspect dependency/version;
2. consult official docs;
3. update adapter only;
4. preserve domain contract;
5. test with mocks/contract tests;
6. document provider-specific change.

## Workflow D — Architecture change

Do not edit code first. Produce or update an ADR, identify affected modules, migration order, rollback path and tests.

## Workflow E — Performance

Measure first. Avoid speculative optimization. Prefer reductions in:
- tool calls;
- DB queries;
- external API requests;
- payload size;
- redundant GPS processing;
- duplicate notifications.

## Workflow F — Release gate

`git diff → tests → lint → typecheck → build → E2E/simulation → security check → docs`
