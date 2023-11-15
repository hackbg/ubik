<div align="center">

# @hackbg/ubik

![](./ubik.svg)

```
“The door refused to open. It said, "Five cents, please.”
― Philip K. Dick, Ubik
```

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

Now you can publish your library with:

```bash
npm run release
# what we do is:
pnpm release
```

## Tasks

### More about fixing extensions

You can also apply the fix in place:

```sh
npm run ubik compile
```

Note that this will modify your `package.json` and leave the original at `package.json.bak`.
Same applies for errors during publishing.

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

If you're publishing a package that requires NPM 2FA,
there's a bug where NPM may not show the OTP prompt
until given an invalid OTP; if you encounter it, you
may want to use this command instead:

```json
  "scripts": {
    "release": "ubik release --access public --otp 000000"
   }
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
