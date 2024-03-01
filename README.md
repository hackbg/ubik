<div align="center">

# @hackbg/ubik

![](./ubik.svg)

---

Made with **#%&!** @ [**Hack.bg**](https://foss.hack.bg)
in response to the Node16/TS4 incompatibility event of Q2 2022,
and growing since then to encompass other codemods that
are guaranteed to increase your enjoyment of TypeScript,
ESM, import maps, packages, namespaces, star imports,
and life in general - or your money back!

---

```
“The door refused to open. It said, "Five cents, please.”
― Philip K. Dick, Ubik
```

</div>

## Publishing a package

The first thing Ubik can do for you is publish well-formed dual CJS/ESM packages from
TypeScript sources. For this, use the `ubik release` command.

```
npm run ubik release
```

The resulting package will contain the `.ts` source alongside all of the following:

* TypeScript source:
    * `*.ts` source code files
* ES Modules:
    * `*.dist.mjs` compiled code files
    * `*.dist.mjs.map` source maps
    * `*.dist.d.mts` typedefs
    * `*.dist.d.mts.map` type maps
* CommonJS:
    * `*.dist.cjs` compiled code files
    * `*.dist.cjs.map` source maps
    * `*.dist.d.cts` typedefs
    * `*.dist.d.cts.map` type maps

Recommended `package.json`:

```json
{
  "main": "index.ts",
  "devDependencies": {
    "typescript": "latest",
    "@hackbg/ubik": "^4"
  },
  "scripts": {
    "release": "ubik release --access public"
  }
}
```

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

Notes:

* Compiling will generate a patched `package.json`, and leave the original at `package.json.bak`.
  Don't commit the generated `package.json` and `package.json.bak`, they are for releases only.
* Append `--otp 000000` to the `release` command if you use NPM 2FA to avoid a login loop.
* `tsc` outputs invalid JavaScript when building ESM libraries. [Read more](./docs/extensions.md)
    * Node 16+ requires extensions in ESM `import`
    * TypeScript does something weird and hamstrung
    * Then people told them and they made it worse

## Compiling a package

You can also apply the fix in place using the `ubik compile` command,
then do the rest of the release in your own way:

```sh
npm run ubik compile
```

## Other tasks

### Fix star imports

When targeting ESM on Node, CommonJS imports are wrapped in an extra `default` key,
of which TypeScript is unaware. [Read more](./docs/split-stars.md)

Let's rewrite the imports so that both work:

```sh
npm exec ubik split-stars ./src -- protobufjs
```

### Add missing `/index.js` to directory imports.

[todo: document](https://youtu.be/VyZiIuMufTA?si=Owhmey5gRLN-AaaK&t=11)

### Separate undifferentiated `import`/`import type`

[todo: document](https://youtu.be/VyZiIuMufTA?si=Owhmey5gRLN-AaaK&t=11)

### Merge packages

[todo: document](https://youtu.be/VyZiIuMufTA?si=Owhmey5gRLN-AaaK&t=11)

## Also goes well with...

[**Ganesha**](https://github.com/hackbg/ganesha), a TypeScript-enabling module loader
for Node 16+. When using Ubik alongside Ganesha, TypeScript usage can become quite transparent:
no build step during development + monolithic publish step to NPM 🐘
