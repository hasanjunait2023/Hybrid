// Test-only stub for "server-only". The real package is a build-time guard that
// errors when a server module is pulled into a client bundle. Outside Next
// (this integration suite) it's a no-op so server modules import cleanly.
export {};
