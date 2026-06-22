// Bridge semver this console build was verified against. Stamped on every
// WS frame as `v` and echoed in `hello.expectedBridgeVersion`. Bridge
// compares same-major (connect + warning) vs different-major (close 4004).
// Bump in lockstep with verified bridge releases.
export const EXPECTED_BRIDGE_VERSION = "0.1.0"
