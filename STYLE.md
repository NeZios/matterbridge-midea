# Style Guide

Concise rules the codebase and coding-agent suggestions should follow.

## 1. General Principles

- Prefer clarity over brevity; explicit names, no ambiguous abbreviations.
- All exported functions/classes/interfaces: full JSDoc.
- Validate external inputs; never trust parameters coming from device/network events: use `isValid...` Matterbridge functions where available.
- Fail fast with descriptive `Error` messages; return early on invalid input.
- Keep functions focused (single responsibility, <= ~40 lines ideally).

## 2. TypeScript Conventions

- Use strict typing; no `any` unless justified with a preceding comment `// intentional any: reason`.
- Prefer `readonly` or `as const` for constant structures / lookup tables.
- Narrow types with guards instead of type assertions. Avoid `as X` unless unavoidable.
- Prefer enums / literal unions over magic numbers. Map protocol constants in lookup arrays.

## 3. Naming

- Functions: verb or verb phrase (`createDevice`, `updateState`).
- Booleans: prefix with `is`/`has`/`can`/`should` for internal helpers; existing state flags may keep names such as `intervalOnOff`.
- Private file-local helpers start with `_` only if intentionally unused yet (silencing oxlint); otherwise export or remove.
- Constants: `UPPER_SNAKE_CASE` only for process env or true constants; otherwise camelCase.

## 4. JSDoc Template

```ts
/**
 * Convert lux to Matter encoded illuminance value.
 *
 * Edge cases:
 *  - <=0 or non-finite -> 0
 *  - Caps at 0xFFFE
 *
 * @param {number} lux Illuminance in lux (>=0).
 * @returns {number} Encoded value (0..0xFFFE)
 */
function luxToMatterExample(lux: number): number {
  if (!Number.isFinite(lux) || lux <= 0) return 0;
  return Math.round(Math.min(10000 * Math.log10(lux), 0xfffe));
}
```

Rules:

- Always include `@param` and `@returns` with explicit types, even if TS can infer.
- Document units, for example `C * 100`, lux, mireds, Pa.
- List clamping and fallback behaviors under `Edge cases`.
- If returning `Promise`, use `@returns {Promise<Type>}`.

## 5. Error Handling & Validation

- Reject invalid numeric input: use `Number.isFinite(n)`; clamp with `Math.min`/`Math.max`.
- When decoding device values, guard against `null`/`undefined` before math.
- Prefer returning `0` / empty array for non-critical sensor errors, log at debug level.
- Throw only for programmer/config errors; not for transient sensor states.

## 6. Logging

- The logger is always `AnsiLogger`.
- Use `log.debug` for verbose internal transitions.
- Use `log.info` for state changes and received commands.
- Use `log.notice` for notices.
- Use `log.warn` for recoverable anomalies.
- Use `log.error` only for failed operations that stop progress.
- Use `log.fatal` only for failed operations that are not recoverable.
- Avoid duplicate logs inside tight intervals; coalesce if needed.

## 7. Formatting & Lint

- `oxfmt` governs formatting. Run `npm run format` or check with `npm run format:check`.
- `oxlint` governs linting. Run `npm run lint`; use `npm run lint:fix` only for focused fixes.
- The default `tabWidth` is 2, `printWidth` is 180, semicolons are required, single quotes are preferred, and multi-line trailing commas are required.
- Keep imports grouped and sorted by oxfmt.
- Use `import type` for type-only imports.
- No trailing spaces; preserve LF line endings.

## 8. Typecheck & Build

- `tsgo` is the default TypeScript engine for development validation.
- Run `npm run typecheck` for no-emit type checking.
- Run `npm run build` for the normal build.
- `npm run buildProduction` still uses `tsc` for the production build path.
- Keep TypeScript ESM-compatible and compatible with Node.js 20, 22, 24, and 26.

## 9. Tests

- Add at least one test per new helper function (happy path + one edge case).
- Use explicit test names describing behavior.
- Keep test data small and deterministic.
- Tests run with Vitest.
- Use `npm run test:coverage -- yourTest.test.ts` for coverage validation.
- Use `npm run test -- yourTest.test.ts` for non-coverage local validation.

## 10. Performance

- Avoid premature optimization; micro-opt only with measurable hotspot proof.
- Prefer simple loops over complex chaining when in per-tick update paths.

## 11. Agent Prompting Hints

- Keeping this file at root lets coding agents pick patterns.
- Keep 2-3 perfect exemplar functions near top of large files.
- Add a brief `// Style: ...` comment before a series of helpers.
- Reject poor suggestions early so the buffer stays clean.

## 12. File Header Blocks

- Keep existing license header exactly; update `@version` only on functional changes, not style edits.

## 13. Deprecation

- Mark deprecated APIs with `@deprecated` explaining alternative and planned removal version.

## 14. Commit Messages

- Use `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, or `chore:`.
- Imperative, lower case first line; no period.

## 15. Release Validation

- Before publish-like changes, run `npm run runMeBeforePublish`.
