/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { stderr, cwd } from 'node:process'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { relative, resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import Logged, { bold } from './Logged.mjs'
import Error from './Error.mjs'
import { runLong } from './run.mjs'

const indent = x => new Array(x).fill(' ').join('')

export default class ImportMap extends Logged {

  static async fromPNPM ({
    cwd = process.cwd(),
    data = JSON.parse(runLong(cwd, 'pnpm', 'ls', '--json', '--depth', 'Infinity'))[0],
    write = false,
    patchMain = x => {},
    patchExports = x => {},
    patchImports = x => {},
  } = {}) {
    const map = new ImportMap({
      path: resolve(cwd, 'importmap.json'),
      patchMain,
      patchExports,
      patchImports,
    })
    console.log({data})
    await map.add(0, data.name, data.version, data.dependencies)
    if (write) writeFileSync(map.path, map.stringified)
    return map
  }

  constructor ({
    path = 'importmap.json',
    scopes = {},
    imports = {},
    patchMain = x => {},
    patchExports = x => {},
    patchImports = x => {},
  } = {}) {
    super()
    this.path         = path
    this.scopes       = scopes
    this.imports      = imports
    this.patchMain    = patchMain
    this.patchExports = patchExports
    this.patchImports = patchImports
  }

  get stringified () {
    return JSON.stringify({ imports: this.imports, scopes: this.scopes }, null, 2)
  }

  async add (depth, name, version, deps = {}, scope = this.imports) {
    this.log.debug('add:', {depth, name, version, deps, scope})
    deps = Object.entries(deps)
    if (deps.length > 0) {
      this.log.log(indent(depth), `deps of ${bold(name||'(unnamed package)')} ${version||'(unspecified version)'}:`)
      // For each resolved dependency:
      for (const [name, {version, path, dependencies, imports}] of deps) {
        // Load package.json of dependency
        const relpath = relative(process.cwd(), path)
        const manifest = JSON.parse(readFileSync(join(relpath, 'package.json'), 'utf8'))
        this.log.log(indent(depth), ` ${bold(name)} (${relpath})`)
        await this.addMain(depth, { scope, name, relpath, manifest })
        const { selfRefs } = await this.addExports(depth, { scope, name, relpath, manifest })
        await this.addImports(depth, { scope, name, relpath, imports })
        // Recurse into the dependencies of this dependency:
        await this.addToImportMap(depth + 2, name, version, dependencies ?? {}, selfRefs ?? {})
      }
    }
  }

  // Rule 01: Add main entrypoint of package.
  async addMain (depth, {
    scope    = Error.required('scope')    || '',
    name     = Error.required('name')     || '',
    relpath  = Error.required('relpath')  || '',
    manifest = Error.required('manifest') || { main: '', module: '', exports: {} }
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
      this.log.log(indent(depth), `  main:`, bold(entrypoint), `-> ${target}`)
      // Extensibility hook
      await this.patchMain({ importMap, depth, scope, name, relpath, manifest, entrypoint })
    }
  }

  // Rule 02: Add contents of "exports"
  async addExports (depth, {
    scope    = Error.required('scope')    || '',
    name     = Error.required('name')     || '',
    relpath  = Error.required('relpath')  || '',
    manifest = Error.required('manifest') || { main: '', module: '', exports: {} }
  } = {}) {
    const { exports = {} } = manifest
    const selfRefs = importMap.scopes[`/${relpath}/`] ??= {}
    for (const [specifier, entry] of Object.entries(exports)) {
      let target = undefined
        ||entry['import']
        ||entry['default']
        ||((typeof entry === 'string')?entry:undefined)
      while (typeof target === 'object') {
        target = target['default']
      }
      if (target) {
        this.log.debug(indent(depth), `  export:`, bold(specifier), '->', bold(target))
        scope[join(name, specifier)] = `./${join(relpath, target)}`
        selfRefs[join(name, specifier)] = `./${join(relpath, target)}`
      } else {
        this.log.warn(indent(depth), `  export:`, bold(specifier), ' - unresolved!', JSON.stringify(entry))
      }
      // Extensibility hook
      await this.patchExports({ importMap, depth, scope, name, relpath, manifest, specifier, entry })
    }
    return { selfRefs }
  }

  async addImports (depth, {
    scope   = Error.required('scope')    || '',
    name    = Error.required('name')     || '',
    relpath = Error.required('relpath')  || '',
    imports = {}
  }) {
    const selfRefs = importMap.scopes[`/${relpath}/`] ??= {}
    if (Object.keys(imports).length > 0) {
      for (const [specifier, entry] of Object.entries(imports)) {
        this.log.log({specifier, entry})
        // Extensibility hook
        await this.patchImports({ importMap, depth, scope, name, relpath, imports, specifier, entry })
      }
    }
  }

}
