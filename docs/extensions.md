TypeScript wants you to import modules with:

```ts
import { foo } from "./foo"
```

but the ECMAScript specification expects:

```js
import { foo } from "./foo.js"
```

TypeScript doesn't add the extensions; it also doesn't provide an extensibility hook
which could be used to add them. [The documentation](https://www.typescriptlang.org/docs/handbook/esm-node.html)
is confusing and unhelpful; the solution that it suggests is ridiculous and unacceptable.
On GitHub issues, the TypeScript developers have repeatedly reacted with indifference.

**Before Node.js 16, this was less of a problem:** imports without extensions still
worked. However, since Node 16 started enforcing the ES Modules spec (which requires
extensions), the code that `tsc` outputs became effectively **invalid and impossible to run**
(unless you were writing your program in a single file).

What, were you expecting the compiler for evertone's favorite "strict superset of JS"
to, idk, output correct JS that is ready to execute? You crazy person!
