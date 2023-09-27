This compatibility issue was discovered when trying to port a Protobuf.js-based API client
to import maps.

As of 2023-09-27, Protobuf is a CommonJS-based library. Polyfilling it in the
browser is perfectly doable. However, the generated protobuf bindings (what I assume
the files importing starting with `import * as _m0` to be) are not completely valid
when targeting ESM on Node, because Node adds an extra `default` key around the library
when importing CJS from ESM, of which TypeScript is blissfully unaware.

That ends up in a situation where you have either working code, or working types. Great!
