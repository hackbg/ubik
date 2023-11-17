<div align="center">

# @hackbg/ubik

![](./ubik.svg)

```
“The door refused to open. It said, "Five cents, please.”
― Philip K. Dick, Ubik
```

---

Made with **#%&!** @ [**Hack.bg**](https://foss.hack.bg)
in response to the Node16/TS4 incompatibility event of Q2 2022

Growing since then, to encompass other codemods you might've
found yourself wishing you could do

Increases you enjoyment of TypeScript, ESM, import maps,
packages, namespaces, star imports, and life in general -
or your money back

---

</div>

What it does:

* Add missing extensions to TypeScript ESM output (required by Node 16+ and hamstrung by TS)
* Add missing `/index.js` to directory imports.
* Separate undifferentiated `import`/`import type` within a package.
* Merge packages that were prematurely separated but ended up tightly coupled.
* Publish patched packages then restore your working tree to a pristine state.

## Quick start

`tsc` outputs invalid JavaScript when building ESM libraries. [Read more](./docs/extensions.md)

To fix this with Ubik, the easiest way is to let it publish your packages:

```json
{
  "devDependencies": {
    "@hackbg/ubik": "^2"
  },
  "scripts": {
    "release": "ubik release --access public"
  }
}
```

* Append `--otp 000000` to the `release` command if you use NPM 2FA to avoid a login loop.

And now you can publish your library with:

```bash
npm run release
# what we do is:
pnpm release
```

You can also apply the fix in place, then do the rest of the release in your own way:

```sh
npm run ubik compile
```

* Note that this will generate a new `package.json` for your package
and leave the original at `package.json.bak`.

* Don't commit the generated `package.json`, it's for releases only.

Recommended `tsconfig.json`:

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

Recommended `.gitignore`:

```
package.json.bak
dist/
*.dist.js
*.dist.mjs
*.dist.cjs
*.dist.d.ts
```

## Other tasks

### Fixing type imports

```sh
// TODO
```

### Fixing star imports

When targeting ESM on Node, CommonJS imports are wrapped in an extra `default` key,
of which TypeScript is unaware. [Read more](./docs/split-stars.md)

Let's rewrite the imports so that both work:

```sh
npm exec ubik split-stars ./src -- protobufjs
```

### Others

[todooooo...](https://youtu.be/VyZiIuMufTA?si=Owhmey5gRLN-AaaK&t=11)

## Also goes well with...

[**Ganesha**](https://github.com/hackbg/ganesha), a TypeScript-enabling module loader
for Node 16+. When using Ubik alongside Ganesha, TypeScript usage can become quite transparent:
no build step during development + monolithic publish step to NPM 🐘
