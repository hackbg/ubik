import { stderr, cwd } from 'node:process'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { relative, resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { console, bold, required } from '../tool/tool.mjs'

const run = (cmd, ...args) => spawnSync(cmd, args, { maxBuffer: Infinity }).stdout.toString()

const indent = x => new Array(x).fill(' ').join('')

export async function generateImportMap ({
  output       = 'importmap.json',
  manifest     = JSON.parse(run('pnpm', 'ls', '--json', '--depth', 'Infinity'))[0],
  importMap    = { imports: {}, scopes: {} },
  patchMain    = x => {},
  patchExports = x => {},
  patchImports = x => {},
  write        = true
} = {}) {

  console.log({manifest})

  await addToImportMap(0, manifest.name, manifest.version, manifest.dependencies, importMap.imports)

  if (write) {
    writeFileSync(output, JSON.stringify(importMap, null, 2))
  }

  async function addToImportMap (depth, name, version, deps, scope) {
    deps = Object.entries(deps)
    if (deps.length > 0) {
      console.log(indent(depth), `deps of ${bold(name||'(unnamed package)')} ${version||'(unspecified version)'}:`)
      // For each resolved dependency:
      for (const [name, {version, path, dependencies, imports}] of deps) {
        // Load package.json of dependency
        const relpath = relative(process.cwd(), path)
        const manifest = JSON.parse(readFileSync(join(relpath, 'package.json'), 'utf8'))
        console.log(indent(depth), ` ${bold(name)} (${relpath})`)
        await addMain(depth, { scope, name, relpath, manifest })
        const { selfRefs } = await addExports(depth, { scope, name, relpath, manifest })
        await addImports(depth, { scope, name, relpath, imports })
        // Recurse into the dependencies of this dependency:
        await addToImportMap(depth + 2, name, version, dependencies ?? {}, selfRefs ?? {})
      }
    }
  }

  // Rule 01: Add main entrypoint of package.
  async function addMain (depth, {
    scope    = required('scope')    || '',
    name     = required('name')     || '',
    relpath  = required('relpath')  || '',
    manifest = required('manifest') || { main: '', module: '', exports: {} }
  } = {}) {
    const { main, module, exports = {} } = manifest
    // Rule 01A: "module" overrides "main", defaulting to "index.js"
    const entrypoint = undefined
      || module
      || main
      || (exports["."]||{})["import"]
      || (exports["."]||{})["default"]
    // If there is a candidate entrypoint:
    if (entrypoint) {
      let target = join(relpath, entrypoint)
      // Rule 01B: auto-add .js extension
      if (!existsSync(target) && existsSync(`${target}.js`)) {
        target = `${target}.js`
      }
      // Rule 01C: if entrypoint is a directory, look for index.js in it
      if (existsSync(target) && statSync(target).isDirectory()) {
        target = join(target, 'index.js')
      }
      // Add to current scope:
      target = `./${target}`
      scope[name] = target
      // Log to console:
      console.log(indent(depth), `  main:`, bold(entrypoint), `-> ${target}`)
      // Extensibility hook
      await patchMain({ importMap, depth, scope, name, relpath, manifest, entrypoint })
    }
  }

  // Rule 02: Add contents of "exports"
  async function addExports (depth, {
    scope    = required('scope')    || '',
    name     = required('name')     || '',
    relpath  = required('relpath')  || '',
    manifest = required('manifest') || { main: '', module: '', exports: {} }
  } = {}) {
    const { exports = {} } = manifest
    const selfRefs = importMap.scopes[`/${relpath}/`] ??= {}
    console.log(depth, name, exports)
    for (const [specifier, entry] of Object.entries(exports)) {
      let target = undefined
        ||entry['import']
        ||entry['default']
        ||((typeof entry === 'string')?entry:undefined)
      while (typeof target === 'object') {
        target = target['default']
      }
      if (target) {
        console.debug(indent(depth), `  export:`, bold(specifier), '->', bold(target))
        scope[join(name, specifier)] = `./${join(relpath, target)}`
        selfRefs[join(name, specifier)] = `./${join(relpath, target)}`
      } else {
        console.warn(indent(depth), `  export:`, bold(specifier), ' - unresolved!', JSON.stringify(entry))
      }
      // Extensibility hook
      await patchExports({ importMap, depth, scope, name, relpath, manifest, specifier, entry })
    }
    return { selfRefs }
  }

  async function addImports (depth, {
    scope   = required('scope')    || '',
    name    = required('name')     || '',
    relpath = required('relpath')  || '',
    imports = {}
  }) {
    const selfRefs = importMap.scopes[`/${relpath}/`] ??= {}
    if (Object.keys(imports).length > 0) {
      for (const [specifier, entry] of Object.entries(imports)) {
        console.log({specifier, entry})
        // Extensibility hook
        await patchImports({ importMap, depth, scope, name, relpath, imports, specifier, entry })
      }
    }
  }

}
