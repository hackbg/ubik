# @hackbg/ubik

![](./ubik.svg)

***Ubik***, named after the mysterious "reality-restoring substance" from
[Philip K. Dick's eponymous novel](https://en.wikipedia.org/wiki/Ubik),
helps you restore compatibility, interoperability, and correctness when
building libraries in TypeScript.

What it does:

* Add missing extensions to TypeScript output.
* Add missing `/index.js` to directory imports.
* Separate undifferentiated `import`/`import type` within a package.
* Merge packages that were prematurely separated but ended up tightly coupled.
* Publish patched packages then restore your working tree to a pristine state.

## Quick start

Add to `package.json`:

```json
{
  "devDependencies": {
    "@hackbg/ubik": "^2"
  }
}
```

Now you can publish your library with `npm run ubik publish`.

## Tasks

### Fixing extensions

The recommended way to do this is by publishing your package with:

```sh
npm run ubik publish
```

You can also do:

```sh
npm run ubik compile
```

Note that this will modify your `package.json` and leave the original at `package.json.bak`.
Same applies for errors during publishing.

For best experience, add to `tsconfig.json`:

```json
{
  "exclude": [
    "dist/**/*"
  ]
}
```

Add to `.gitignore`:

```
package.json.bak
dist/
*.dist.js
*.dist.mjs
*.dist.cjs
*.dist.d.ts
```

This assumes that the entrypoint of your package (`main` in `package.json`)
is at the top level of your source code tree, e.g. `./index.ts` or `./src/index.ts` -
but not e.g. `./src/foo/index.ts` next to `./src/bar/somethingelse.ts` (the latter
would probably fail to compile all files or will place them in inappropriate locations -
good matter for a pull request.)

#### Fixing extensions - rationale

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

### Splitting away type imports

```sh
// TODO
```

### Fixing CommonJS star imports

```sh
// TODO
```

### Others

Todo-todo, todo todo [todooooo...](https://youtu.be/VyZiIuMufTA?si=Owhmey5gRLN-AaaK&t=11)

## Also goes well with...

When using Ubik alongside the [**`@hackbg/ganesha`**](https://github.com/hackbg/ganesha)
module loader for Node 16+, TypeScript on the backend becomes completely transparent:
no build step during development + monolithic publish step 🐘

<div align="center">

---

Made with **#%&!** @ [**Hack.bg**](https://foss.hack.bg)
in response to the Node16/TS4 incompatibility event of Q2 2022.

</div>
