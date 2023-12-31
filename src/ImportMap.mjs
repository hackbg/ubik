/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { stderr, cwd } from 'node:process'
import { readFileSync, writeFileSync, statSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { relative, resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as resolver from 'resolve.exports'
import Package from './Package.mjs'

import Logged, { bold } from './Logged.mjs'
import Error from './Error.mjs'
import { runLong } from './run.mjs'

const indent = x => new Array(x).fill(' ').join('')

export default class ImportMap extends Logged {

  constructor ({
    path              = 'importmap.json',
    scopes            = {},
    imports           = {},
    patchMain         = (_,__) => {},
    patchExports      = (_,__) => {},
    patchImports      = (_,__) => {},
    conditions        = [ 'module', 'browser', 'default' ],
    legacyEntrypoints = [ 'module', 'browser', 'main' ]
  } = {}) {
    super()
    this.path              = path
    this.scopes            = scopes
    this.imports           = imports
    this.patchMain         = patchMain
    this.patchExports      = patchExports
    this.patchImports      = patchImports
    this.conditions        = conditions
    this.legacyEntrypoints = legacyEntrypoints
  }

  get stringified () {
    return JSON.stringify({ imports: this.imports, scopes: this.scopes }, null, 2)
  }

  async add (depth, name, version, deps, scope = this.imports) {
    deps = Object.entries(deps || {})

    if (deps.length > 0) {

      // For each resolved dependency:
      for (const [name, {version, path, dependencies, imports}] of deps) {

        // Load package.json of dependency
        const relpath = relative(process.cwd(), path)
        const pkg = new Package(relpath)//JSON.parse(readFileSync(join(relpath, 'package.json'), 'utf8'))
        this.log.debug(indent(depth), pkg)

        // Report dependency
        this.log.log().log(indent(depth), `${bold(name)} ${version} (${relpath})`)

        // Add main entrypoint of dependency
        await this.addMain(depth, { scope, name, relpath, pkg })

        // What is this
        const { selfRefs } = await this.addExports(depth, { scope, name, relpath, pkg })

        // What is that
        await this.addImports(depth, { scope, name, relpath, imports })

        // Recurse into the dependencies of this dependency:
        await this.add(depth + 2, name, version, dependencies ?? {}, selfRefs ?? {})

      }

    }

    return this
  }

  // Rule 01: Add main entrypoint of package.
  async addMain (depth, {
    scope    = Error.required('scope')    || '',
    name     = Error.required('name')     || '',
    relpath  = Error.required('relpath')  || '',
    pkg = Error.required('pkg') || { main: '', module: '', exports: {} }
  } = {}) {
    const { main, module, exports = {} } = pkg

    let resolvedExports = []
    try {
      resolvedExports = resolver.exports(pkg, pkg.name) || [] // this.conditions
    } catch (e) {
      this.log.warn(e)
    }

    let resolvedLegacyEntrypoint
    for (const field of this.legacyEntrypoints) {
      const resolved = resolver.legacy(pkg, { fields: [field] })
      if (typeof resolved === 'string') {
        resolvedLegacyEntrypoint = resolved
        break
      }
    }
    const candidateEntrypoints = [
      ...resolvedExports,
      resolvedLegacyEntrypoint,
      'index.js'
    ]

    //this.log.debug(indent(depth), name, '=?', candidateEntrypoints)
    
    const entrypoint = candidateEntrypoints.filter(Boolean)[0]

    if (!entrypoint) {
      this.log.warn('No entrypoint found for', bold(name))
      this.log.debug('package.json of', name, ':', pkg)
      return
    }

    let target = join(relpath, entrypoint)

    // auto-add .js extension
    if (!existsSync(target) && existsSync(`${target}.js`)) {
      target = `${target}.js`
    }

    // if entrypoint is a directory, look for index.js in it
    if (existsSync(target) && statSync(target).isDirectory()) {
      target = join(target, 'index.js')
    }

    // Add to current scope:
    target = `./${target}`
    scope[name] = target

    this.log.log(indent(depth), `*`, bold(entrypoint), `-> ${target}`)

    // Extensibility hook
    await this.patchMain(this, { depth, scope, name, relpath, pkg, entrypoint })

  }

  // Rule 02: Add contents of "exports"
  async addExports (depth, {
    scope    = Error.required('scope')    || '',
    name     = Error.required('name')     || '',
    relpath  = Error.required('relpath')  || '',
    pkg = Error.required('pkg') || { main: '', module: '', exports: {} }
  } = {}) {
    const { exports = {} } = pkg
    const selfRefs = this.scopes[`/${relpath}/`] ??= {}
    for (const [specifier, entry] of Object.entries(exports)) {
      let target = undefined
        ||entry['module']
        ||entry['import']
        ||entry['default']
        ||((typeof entry === 'string')?entry:undefined)
      while (typeof target === 'object') {
        target = target['default']
      }
      if (target) {
        this.log.log(indent(depth), `+`, bold(specifier), '->', bold(target))
        scope[join(name, specifier)] = `./${join(relpath, target)}`
        selfRefs[join(name, specifier)] = `./${join(relpath, target)}`
      } else {
        this.log.warn(indent(depth), `  export:`, bold(specifier), ' - unresolved!', JSON.stringify(entry))
      }
      // Extensibility hook
      await this.patchExports(this, { depth, scope, name, relpath, pkg, specifier, entry })
    }
    return { selfRefs }
  }

  async addImports (depth, {
    scope   = Error.required('scope')    || '',
    name    = Error.required('name')     || '',
    relpath = Error.required('relpath')  || '',
    imports = {}
  }) {
    const selfRefs = this.scopes[`/${relpath}/`] ??= {}
    if (Object.keys(imports).length > 0) {
      for (const [specifier, entry] of Object.entries(imports)) {
        this.log.log({specifier, entry})
        // Extensibility hook
        await this.patchImports(this, { depth, scope, name, relpath, imports, specifier, entry })
      }
    }
  }

}

export class PNPMImportMap extends ImportMap {

  constructor ({
    write = false,
    root  = process.cwd(),
    pkg   = JSON.parse(runLong(root, 'pnpm', 'ls', '--json', '--depth', 'Infinity'))[0],
    ...options
  } = {}) {
    super({ path: resolve(root, 'importmap.json'), ...options })
    this.ready = this.add(0, pkg.name, pkg.version, pkg.dependencies)
    this.ready.then(()=>{
      if (write) {
        this.log('Writing to', bold(this.path))
        writeFileSync(this.path, this.stringified)
      }
    })
  }

}
