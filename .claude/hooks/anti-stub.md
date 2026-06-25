# ANTI-STUB RULES

Shipping code is wired end-to-end against real DB/services. No fakes.

## Reject if present
- `TODO`, `FIXME`, `XXX`, `HACK` left in shipping code
- `pass`, `...`, empty function bodies as placeholders
- `placeholder`, `dummy`, `example`, `lorem ipsum` standing in for real values
- `throw new Error("not implemented")`
- "rest is left to you", "you can finish this", "and so on" type hand-offs
- Mock data outside `packages/db/sql/03_seed.sql` and clearly-labelled dev seeders
- Hardcoded secrets / credentials (use env + `APP_ENCRYPTION_KEY`)
- Commented-out blocks shipped "for later"

## Required instead
- Every function has a real implementation against the real DB/service.
- Can't finish something? **Flag it explicitly** in the response — do not fake it and move on.
- Error paths handled (no silent swallow; user-facing errors friendly + Bengali).
- Tenant data via `withTenant()`.

## Self-check before claiming done
```
grep -rnE "TODO|FIXME|placeholder|not implemented|\bpass\b" <changed files>
```
Zero hits in shipping code, or each hit explained.
