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

`tsc` outputs invalid JavaScript when building ESM libraries. [Read more](./docs/extensions.md)

The recommended way to fix this with Ubik is by using the following command
instead of `npm publish` to publish your package to NPM:

```sh
npm run ubik publish
```

You can also do this to apply the fix in place:

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
  ],
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "node10"
  }
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

**KNOWN ISSUE:** This operation assumes that the entrypoint of your package (`main` in `package.json`)
is at the top level of your source code tree, e.g. `./index.ts` or `./src/index.ts` -
but not e.g. `./src/foo/index.ts` next to `./src/bar/somethingelse.ts` (the latter
would probably fail to compile all files or will place them in inappropriate locations -
good matter for a pull request.)

### Splitting away type imports

```sh
// TODO
```

### Fixing CommonJS star imports

When targeting ESM on Node, CommonJS imports are wrapped in an extra `default` key,
of which TypeScript is unaware. [Read more](./docs/split-stars.md)

Let's rewrite the imports so that both work:

```sh
npm exec ubik split-stars ./src -- protobufjs
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
