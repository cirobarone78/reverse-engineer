import { expect, it } from "vitest";

import { analyzeJavaScriptSemantics } from "./javascriptSemanticAnalysis.js";

/**
 * `net`/`tls` read `options.host` and throw `ERR_INVALID_ARG_TYPE` from the call itself
 * when the member is truthy and not a string, so no socket exists afterwards. Every
 * falsy value falls through to the default and is accepted.
 *
 * Measured on Node 24.22.1:
 *
 *   host: undefined / null / "" / 0 / -0 / false / 0n / NaN / void 0 / !1  -> Socket created
 *   host: "localhost" / "0.0.0.0" / `x`                                    -> Socket created
 *   host: 1 / 1.5 / true / 1n / {} / [] / /x/ / Symbol() / () => {}        -> THREW ERR_INVALID_ARG_TYPE
 *   host: new String("x") / new Number(1)                                  -> THREW ERR_INVALID_ARG_TYPE
 *
 * The positional second argument is a different slot and is not validated —
 * `net.connect(0, 5)` connects — so only the member is decided.
 */
const acquisitionsFor = (call: string) =>
  analyzeJavaScriptSemantics(
    `import net from "node:net";\nimport tls from "node:tls";\nfunction g() { ${call}; }`,
  ).resourceOperations.map(({ kind, method }) => ({ kind, method }));

it.each([
  ["a numeric host", `net.connect({ port: 0, host: 1 })`],
  ["a fractional host", `net.connect({ port: 0, host: 1.5 })`],
  ["a boolean host", `net.connect({ port: 0, host: true })`],
  ["a BigInt host", `net.connect({ port: 0, host: 1n })`],
  ["an object host", `net.connect({ port: 0, host: {} })`],
  ["an array host", `net.connect({ port: 0, host: [] })`],
  ["a regular-expression host", `net.connect({ port: 0, host: /x/ })`],
  ["a boxed string host", `net.connect({ port: 0, host: new String("x") })`],
  ["a boxed number host", `net.connect({ port: 0, host: new Number(1) })`],
  ["a function host", `net.connect({ port: 0, host: () => {} })`],
  ["an Infinity host", `net.connect({ port: 0, host: Infinity })`],
  ["a tls numeric host", `tls.connect({ port: 0, host: 5 })`],
  ["a tls object host", `tls.connect({ port: 0, host: {} })`],
] as const)("emits no socket acquisition for %s", (_name, call) => {
  expect(acquisitionsFor(call)).toEqual([]);
});

it.each([
  ["an omitted host", `net.connect({ port: 0 })`, "connect"],
  ["an undefined host", `net.connect({ port: 0, host: undefined })`, "connect"],
  ["a null host", `net.connect({ port: 0, host: null })`, "connect"],
  ["an empty-string host", `net.connect({ port: 0, host: "" })`, "connect"],
  ["a zero host", `net.connect({ port: 0, host: 0 })`, "connect"],
  ["a negative-zero host", `net.connect({ port: 0, host: -0 })`, "connect"],
  ["a false host", `net.connect({ port: 0, host: false })`, "connect"],
  ["a zero BigInt host", `net.connect({ port: 0, host: 0n })`, "connect"],
  ["a NaN host", `net.connect({ port: 0, host: NaN })`, "connect"],
  ["a void host", `net.connect({ port: 0, host: void 0 })`, "connect"],
  ["a negated host", `net.connect({ port: 0, host: !1 })`, "connect"],
  ["a loopback host", `net.connect({ port: 0, host: "localhost" })`, "connect"],
  ["a wildcard host", `net.connect({ port: 0, host: "0.0.0.0" })`, "connect"],
  ["a template host", "net.connect({ port: 0, host: `x` })", "connect"],
  ["a positional numeric host", `net.connect(0, 5)`, "connect"],
  [
    "a tls string host",
    `tls.connect({ port: 0, host: "localhost" })`,
    "connect",
  ],
] as const)("keeps the socket acquisition for %s", (_name, call, method) => {
  expect(acquisitionsFor(call)).toEqual([{ kind: "acquire", method }]);
});
