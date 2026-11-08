import { expect, it } from "vitest";

import { analyzeJavaScriptSemantics } from "./javascriptSemanticAnalysis.js";

/**
 * `net`/`tls` read `options.host` and throw `ERR_INVALID_ARG_TYPE` from the call itself
 * when the member is truthy and not a string, so no socket exists afterwards. Every
 * falsy value falls through to the default and is accepted.
 *
 * Measured on Node 24.22.1 — accepted: `undefined`, `null`, `""`, `0`, `-0`, `false`,
 * `0n`, `NaN`, `void 0`, `!1`, `"localhost"`, `String("127.0.0.1")`, and anything when
 * `path` selects the Unix overload. Threw: `1`, `1.5`, `true`, `1n`, `{}`, `[]`, `/x/`,
 * `new String("x")`, `new Number(1)`, `!0`, `-1`, `+1`, `!!1`, `Infinity`, `Symbol("x")`,
 * `Number(1)`, `Boolean(1)`.
 *
 * The positional second argument is a different slot Node does not validate —
 * `net.connect(0, 5)` connects — so only the member is decided.
 */
const acquisitionsFor = (body: string) =>
  analyzeJavaScriptSemantics(
    `import net from "node:net";\nimport tls from "node:tls";\nfunction g() { ${body}; }`,
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
  ["the Infinity global", `net.connect({ port: 0, host: Infinity })`],
  ["a negated zero host", `net.connect({ port: 0, host: !0 })`],
  ["a negated number host", `net.connect({ port: 0, host: -1 })`],
  ["a unary-plus host", `net.connect({ port: 0, host: +1 })`],
  ["a double-negated host", `net.connect({ port: 0, host: !!1 })`],
  ["a Symbol call host", `net.connect({ port: 0, host: Symbol("x") })`],
  ["a Number call host", `net.connect({ port: 0, host: Number(1) })`],
  ["a Boolean call host", `net.connect({ port: 0, host: Boolean(1) })`],
  ["a tls numeric host", `tls.connect({ port: 0, host: 5 })`],
  ["a tls object host", `tls.connect({ port: 0, host: {} })`],
] as const)("emits no socket acquisition for %s", (_name, call) => {
  expect(acquisitionsFor(call)).toEqual([]);
});

it.each([
  ["an omitted host", `net.connect({ port: 0 })`],
  ["an undefined host", `net.connect({ port: 0, host: undefined })`],
  ["a null host", `net.connect({ port: 0, host: null })`],
  ["an empty-string host", `net.connect({ port: 0, host: "" })`],
  ["a zero host", `net.connect({ port: 0, host: 0 })`],
  ["a negative-zero host", `net.connect({ port: 0, host: -0 })`],
  ["a false host", `net.connect({ port: 0, host: false })`],
  ["a zero BigInt host", `net.connect({ port: 0, host: 0n })`],
  ["a NaN host", `net.connect({ port: 0, host: NaN })`],
  ["a void host", `net.connect({ port: 0, host: void 0 })`],
  ["a negated host", `net.connect({ port: 0, host: !1 })`],
  ["a loopback host", `net.connect({ port: 0, host: "localhost" })`],
  ["a template host", "net.connect({ port: 0, host: `x` })"],
  ["a String call host", `net.connect({ port: 0, host: String("127.0.0.1") })`],
  [
    "an unresolved call host",
    `const g = () => "localhost"; net.connect({ port: 0, host: g() })`,
  ],
  [
    "a later spread host",
    `net.connect({ port: 0, host: 1, ...{ host: "127.0.0.1" } })`,
  ],
  [
    "a later computed host",
    `net.connect({ port: 0, host: 1, ["host"]: "127.0.0.1" })`,
  ],
  [
    "a later duplicate host",
    `net.connect({ port: 0, host: 1, host: "localhost" })`,
  ],
  [
    "a Unix path overriding a bad host",
    `net.connect({ path: "/tmp/x.sock", host: 1 })`,
  ],
  [
    "a shadowed Infinity host",
    `const Infinity = "localhost"; net.connect({ port: 0, host: Infinity })`,
  ],
  ["a positional numeric host", `net.connect(0, 5)`],
  ["a tls socket wrap", `tls.connect({ socket: null, host: 1 })`],
  ["a tls string host", `tls.connect({ port: 0, host: "localhost" })`],
] as const)("keeps the socket acquisition for %s", (_name, call) => {
  expect(acquisitionsFor(call)).toEqual([
    { kind: "acquire", method: "connect" },
  ]);
});
