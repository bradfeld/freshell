# Debug Logging to Disk (Perf as Debug Only)

Date: 2026-02-02
Status: Approved

## Summary
We will split server logging into two destinations: stdout at info+ and a rotating JSONL file at debug+. Perf logs will be downgraded to debug so they are written only to disk. The existing Debug logging toggle will continue to gate debug/perf emission and perf instrumentation, but will no longer increase console verbosity.

## Goals
- Persist debug logs (including perf) to disk as structured JSONL.
- Keep console output at info+ regardless of Debug logging setting.
- Ensure perf logs never print to server stdout.
- Bound disk usage with size-based rotation.

## Non-goals
- Client log routing changes.
- Log shipping or external observability integrations.
- Changing existing info/warn/error semantics.

## Architecture
- **Logger split:** Use `pino` multi-stream: console stream at level `info`, file stream at level `debug`.
- **File location:** Default to `~/.freshell/logs/server-debug.jsonl` with rotation (10MB x 5 files). Use `rotating-file-stream` for size-based rotation with suffixes (`.1`, `.2`, ...).
- **Overrides:** Add env overrides `FRESHELL_LOG_DIR` (directory) and `LOG_DEBUG_PATH` (explicit file path). `LOG_DEBUG_PATH` wins.
- **Perf logging:** Downgrade perf emissions to `debug` only; include a `perfSeverity` field when callers request warn/error thresholds so intent is preserved in the file without surfacing to stdout.
- **Toggle behavior:** `settings.logging.debug` controls `logger` level (`debug` when enabled, `info` when disabled) and perf instrumentation on/off as today. Console remains `info+` at all times.

## Data Flow
1. Startup resolves log path and initializes `pino` multi-stream.
2. Console stream receives `info+` events (pretty in dev).
3. File stream receives `debug+` events (JSONL).
4. When Debug logging is enabled, debug/perf logs are emitted to the file; console remains unchanged.
5. Perf events (timers, system samples) are emitted at `debug` with `perfSeverity` set when thresholds trigger.

## Error Handling
- If the log directory cannot be created or the file stream fails, emit a single `warn` to the console and continue with console-only logging. The app should not crash or block startup.
- Rotation failures should be logged as warnings (console), but should not terminate the server.

## Testing
- Unit tests for log path resolution and env override precedence.
- Unit test verifying `debug` logs are written to the file when Debug logging is enabled, while `info` logs still go to stdout.
- Rotation test: write enough data to exceed 10MB and assert a rotated file exists.
- Perf logger tests: confirm `logPerfEvent` and timers emit `debug` level with `perfSeverity` when provided.

## Rollout / Migration
- No data migration required.
- Document new env vars in developer notes (no README change unless explicitly requested).

