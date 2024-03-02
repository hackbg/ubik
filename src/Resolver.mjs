/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, dirname, resolve, join as joinPath, sep } from 'node:path'
import recast from 'recast'
import * as acorn from 'acorn'
import { recastTS } from '../shims.cjs'
import { Console, bold } from './Logged.mjs'
import Error from './Error.mjs'

const console = new Console('@hackbg/ubik (resolve)')

/** Join path fragments, enforcing Unix-style path separator. */
export function join (...fragments) {
  return joinPath(...fragments).split(sep).join('/')
}

/** The resolver class is the root of an Ubik run.
  * It keeps track of all paths that are part of the
  * codebase that is being modified. */
export default class Resolver extends Map {
  /** Create a new resolver. */
  constructor (root = '.') {
    super()
    root = resolve(process.cwd(), root)
    let stats
    try {
      stats = statSync(root)
    } catch (e) {
      if (e.code === 'ENOENT') {
        throw new Error(`${bold(root)} does not exist`)
      } else {
        throw e
      }
    }
    if (!statSync(root).isDirectory()) {
      throw new Error(`${bold(root)} must be a directory`)
    }
    console.log(`Resolving from:`, bold(root))
    this.root = root
  }
  /** Recursively load contents of passed directories. */
  load (paths = readdirSync(this.root)) {
    for (let path of paths) {
      if (path === 'node_modules' || path.endsWith('/node_modules')) {
        continue
      }
      path = join(this.root, path)
      console.debug('load:', bold(relative(this.root, path)))
      const stat = statSync(path)
      const relpath = relative(this.root, resolve(path))
      if (stat.isDirectory()) {
        this.set(relpath, new Directory(this, relpath))
        continue
      }
      if (stat.isFile()) {
        if (path.endsWith('.ts')) {
          this.set(relpath, new TSFile(this, relpath))
          continue
        } else if (path.endsWith('.json')) {
          this.set(relpath, new JSONFile(this, relpath))
          continue
        } else{
          this.set(relpath, new File(this, relpath))
          continue
        }
      }
    }
    return this
  }
  /** Resolve a reference (import or reexport) from `source` to `target`.
    * This assumes that the reference is by relative path, i.e. contained
    * in the same package. Package imports will return `null`. */
  resolve (source, target) {
    // Ignore package imports
    if (!target.startsWith('.')) {
      return null
    }
    // Fail on `.ts` extension
    if (target.endsWith('.ts')) {
      throw new Error('TypeScript disallows imports ending in .ts')
    }
    // Resolve the path
    let path = join(relative(this.root, resolve(this.root, dirname(source), target)))
    if (path.startsWith('./')) {
      path = path.slice(2)
    }
    // Non-TS files (such as JS or JSON imports)
    if (this.has(path) && this.get(path) instanceof File && !(this.get(path) instanceof TSFile)) {
      console.warn(`${bold(path)} is a non-TS import`)
      return this.get(path)
    }
    // TS files - need to add extension
    if (this.has(`${path}.ts`)) {
      // Warn about collision if there is both directory and file with the same name
      if (this.has(`${path}/index.ts`)) {
        console.warn(`
          both ${bold(`${path}.ts`)} and ${bold(`${path}/index.ts`)} exits: using first one
        `.trim())
      }
      return this.get(`${path}.ts`)
    }
    // Directories - need to add index.ts
    if (this.has(`${path}/index.ts`)) {
      console.warn(`
        ${bold(path)} is a directory import - this is invalid ESM and will be fixed
      `.trim())
      return this.resolve(source, `${target}/index`)
    }
    throw new Error(`${target}: not found (from ${source})`)
  }
  /** Apply the codemods. */
  patch () {
    return this.forEach(entry => {
      if (entry instanceof TSFile) entry.patch()
    })
  }
  /** Save the modified files. */
  save (dryRun = false) {
    const saved = new Map()
    this.forEach(entry => {
      if (entry instanceof TSFile) {
        const code = entry.save(dryRun)
        saved.set(entry.path, code)
      }
    })
    return saved
  }
  /** Call a transformation function for each entry in the resolver. */
  forEach (x, y) {
    super.forEach(x, y)
    return this
  }
}

/** Represents a file or directory. */
export class Entry {
  path
  constructor (resolver, path) {
    this.resolver = resolver
    this.path = resolve(resolver.root, path)
    Object.defineProperty(this, 'resolver', { enumerable: false })
  }
}

/** Represents a directory. */
export class Directory extends Entry {
  constructor (resolver, path) {
    super(resolver, path)
    const entries = readdirSync(this.path).map(entry=>{
      const joined = join(this.path, entry)
      return relative(resolver.root, joined)
    })
    this.resolver.load(entries)
  }
}

/** Represents a file. */
export class File extends Entry {
  constructor (resolver, path) {
    super(resolver, path)
  }
}

/** Represents a JSON file. */
export class JSONFile extends File {
  constructor (resolver, path) {
    super(resolver, path)
  }
  parse () {
    return JSON.parse(readFileSync(this.path, 'utf8'))
  }
}

/** Represents a TypeScript module. Keeps track of its imports and exports. */
export class TSFile extends File {
  source
  constructor (resolver, path, source = readFileSync(resolve(resolver.root, path), 'utf8')) {
    super(resolver, path)
    Object.defineProperty(this, 'source', { get () { return source } })
  }
  get parsed () {
    this.load()
    return this.parsed
  }
  get imports () {
    this.load()
    return this.imports
  }
  get importTypes () {
    this.load()
    return this.importTypes
  }
  get exports () {
    this.load()
    return this.exports
  }
  get exportTypes () {
    this.load()
    return this.exportTypes
  }
  get reexports () {
    this.load()
    return this.reexports
  }
  get reexportTypes () {
    this.load()
    return this.reexportTypes
  }
  /** Populate imports and exports */
  load () {
    const handles = getImportsExports(this.resolver, this.path, this.source)
    const {
      parsed, imports, importTypes, exports, exportTypes, reexports, reexportTypes
    } = handles
    const prop = value => ({ enumerable: true, writable: true, configurable: true, value })
    Object.defineProperties(this, {
      parsed:        prop(parsed),
      imports:       prop(imports),
      importTypes:   prop(importTypes),
      exports:       prop(exports),
      exportTypes:   prop(exportTypes),
      reexports:     prop(reexports),
      reexportTypes: prop(reexportTypes)
    })
  }
  /** Replace `import` with `import type` where appropriate. */
  patch () {
    return Object.assign(this, separateTypeImports(this))
  }
  /** Update AST with patched imports and write updated code. */
  save (dry = false) {
    return saveModifiedFile(this, dry)
  }
}

export function saveModifiedFile ({
  path,
  resolver,
  parsed,
  imports,
  importTypes,
  reexports,
  reexportTypes
}, dry) {
  // Visit each import (or reexport) declaration and
  // separate it into `import` and `import type`:
  recast.visit(parsed, {
    visitImportDeclaration: declaration => {
      const typeDeclaration = addTypeSection(
        declaration,
        'ImportNamespaceSpecifier',
        imports.get(declaration.value.source.value),
        importTypes.get(declaration.value.source.value),
        (source, specifiers) => recast.types.builders.importDeclaration(
          specifiers, source
        ),
        'importKind'
      )
      addDirectorySuffix(resolver, path, declaration)
      if (typeDeclaration) {
        addDirectorySuffix(resolver, path, typeDeclaration)
      }
      return false
    },
    visitExportNamedDeclaration: declaration => {
      if (declaration.value.source) {
        const typeDeclaration = addTypeSection(
          declaration,
          'ExportNamespaceSpecifier',
          reexports.get(declaration.value.source.value),
          reexportTypes.get(declaration.value.source.value),
          (source, specifiers) => recast.types.builders.exportNamedDeclaration(
            null, specifiers, source
          ),
          'exportKind'
        )
        addDirectorySuffix(resolver, path, declaration)
        if (typeDeclaration) {
          addDirectorySuffix(resolver, path, typeDeclaration)
        }
      }
      return false
    },
    visitExportAllDeclaration: declaration => {
      //console.log('export all:', declaration)
      return false
    }
  })
  // Write the modified code:
  const { code } = recast.print(parsed)
  // If this is not a dry run, save the modified file now.
  if (!dry) {
    writeFileSync(path, code)
  }
  return code
}

// Directory imports are Node-specific and not valid ESM.
// This fix is slightly less performant than it could be,
// as it calls resolve once again.
export function addDirectorySuffix (resolver, path, declaration) {
  const resolved = resolver.resolve(path, declaration.value.source.value)
  if (resolved) {
    // Append `/index` to the import source if trying to import from directory.
    if (
      // The `/index.ts` part is added by Directory#resolve
      resolved.path.endsWith('/index.ts') &&
      // Nothing to do if the import already contains `/index`
      !declaration.value.source.value.endsWith('/index')
    ) {
      declaration.value.source.value += '/index'
    }
  } else if (declaration.value.source.value.startsWith('.')) {
    // Throw if a relative import was not found.
    throw new Error(`failed resolving ${declaration.value.source.value} from ${path}`)
  }
}

// Split the declaration's specifiers into value and type imports
// according to the result of the preceding call to `resolve`.
export function addTypeSection (
  declaration,
  namespaceSpecifier,
  newValues,
  newTypes,
  buildDeclaration,
  kind
) {
  // Leave only the value specifiers, separating the type specifiers.
  const typeSpecifiers = []
  declaration.value.specifiers = declaration.value.specifiers.filter(specifier=>{
    // Preserve `import *`:
    if (specifier.type === namespaceSpecifier) {
      return true
    }
    // Extract imports that resolve to types:
    if (newTypes && newTypes.has(specifier.local?.name)) {
      typeSpecifiers.push(specifier)
      return false
    }
    // Pass through the rest as is:
    return true
  })
  // If there were any type specifiers extracted,
  // we need to contain them in an `import type` declaration
  // so that they don't get compiled to missing `import`s.
  if (typeSpecifiers.length > 0) {
    if (declaration.value.specifiers.length < 1) {
      // If all specifiers turned out to be type specifiers,
      // and there are no remaining value specifiers, change
      // the existing import declaration to `import type`
      // so as not to lose the attached comment nodes.
      declaration.value.specifiers = typeSpecifiers
      declaration.value[kind] = 'type'
    } else {
      // If the declaration turned out to contain some
      // type specifiers and also some value specifiers,
      // append a separate `import type`  after the `import`.
      const typeDeclaration = Object.assign(buildDeclaration(
        declaration.value.source, typeSpecifiers, 
      ), {
        [kind]: 'type'
      })
      declaration.insertAfter(typeDeclaration)
      return { value: typeDeclaration }
    }
  }
}

export function separateTypeImports ({
  path,
  resolver,
  imports,
  importTypes,
  reexports,
  reexportTypes
}) {

  // Copy the collections that we will be modifying
  const newImports = cloneMap(imports)
  const newImportTypes = cloneMap(importTypes)
  const newReexports = cloneMap(reexports)
  const newReexportTypes = cloneMap(reexportTypes)

  // For every `import` declaration in current module:
  for (const [target, specifiers] of imports.entries()) {
    console.log(``)
    console.log(`into ${bold(relative(resolver.root, path))} from ${bold(target)}:`)
    updateImportExport(
      'importing from', resolver, path, target, specifiers, newImports, newImportTypes
    )
  }

  // For every `export from` declaration in current module:
  for (const [target, specifiers] of reexports.entries()) {
    console.log(``)
    console.log(`thru ${relative(resolver.root, path)} from ${bold(target)}:`)
    updateImportExport(
      'exporting thru', resolver, path, target, specifiers, newReexports, newReexportTypes
    )
  }

  // Replace collections with the modified ones
  return {
    imports: newImports,
    importTypes: newImportTypes,
    reexports: newReexports,
    reexportTypes: newReexportTypes,
  }

}

/** Update import/reexport mapping data */
function updateImportExport (
  mode,
  resolver,
  path,
  target,
  specifiers,
  newValues,
  newTypes,
) {
  const resolved = resolveTarget(resolver, path, target)
  if (!resolved) return
  if (resolved.path.endsWith('.json')) return
  for (const [alias, name] of specifiers) {
    if (name !== alias) {
      console.log(`     ${bold(name)} (as ${bold(alias)})`)
    } else {
      console.log(`     ${bold(name)}`)
    }
    // If it's missing in the referenced module's
    // exported values, but exists in its exported *types*,
    // change the `import/export` statement to `import/export type`:
    if (!resolved.exports.has(name)) {
      if (resolved.exportTypes.has(name)) {
        console.log(`     changing to type:`, bold(alias))
        newValues.get(target).delete(name)
        getDefault(newTypes, target, new Map()).set(name, alias)
      } else {
        throw Object.assign(new Error(
          `"${name}" not found in ${resolved.path} (${mode} ${path})`
        ), {
          resolved
        })
      }
    }
  }
}

/** Resolve an import/reexport source */
function resolveTarget (resolver, path, target) {
  const resolved = resolver.resolve(path, target)
  // Only fail on unresolved relative imports
  if (!resolved && target.startsWith('.')) {
    throw new Error(`failed resolving ${target} from ${path}`)
  }
  return resolved
}

/** Clone a map of maps */
function cloneMap (oldMap) {
  const newMap = new Map()
  for (const [key, submap] of oldMap) {
    newMap.set(key, new Map(submap))
  }
  return newMap
}


/** Parse source, extracting all import/export declarations. */
export function getImportsExports (resolver, sourcePath, source) {

  const imports       = new Map()
  const importTypes   = new Map()
  const exports       = new Set()
  const exportTypes   = new Set()
  const reexports     = new Map()
  const reexportTypes = new Map()

  const parsed = recast.parse(source, { parser: recastTS })

  for (const declaration of parsed.program.body) {

    switch (declaration.type) {

      // Keep track of each imported module and what is imported from it.
      case 'ImportDeclaration':
        if (declaration.importKind === 'type') {
          addImport(importTypes, declaration)
        } else {
          addImport(imports, declaration)
        }
        continue

      // Keep track of every export (and its origin, if it's a reexport)
      case 'ExportAllDeclaration':
        const resolved = resolver.resolve(sourcePath, declaration.source.value)
        const reexportedTypes = getDefault(reexportTypes, declaration.source.value, new Map())
        if (resolved) {
          for (const exported of resolved.exportTypes) {
            exportTypes.add(exported)
            reexportedTypes.set(exported, exported)
          }
          if (declaration.exportKind !== 'type') {
            const reexportedValues = getDefault(reexports, declaration.source.value, new Map())
            for (const exported of resolved.exports) {
              exports.add(exported)
              reexportedValues.set(exported, exported)
            }
          }
        }
        continue
      case 'ExportNamedDeclaration':
        if (declaration.exportKind === 'type') {
          addExport(exportTypes, declaration)
          if (declaration.source) addReexport(reexportTypes, declaration)
        } else {
          addExport(exports, declaration)
          if (declaration.source) addReexport(reexports, declaration)
        }
        continue
      case 'ExportDefaultDeclaration':
        if (declaration.exportKind === 'type') {
          addExportDefault(exportTypes, declaration)
          if (declaration.source) addReexport(reexportTypes, declaration)
        } else {
          addExportDefault(exports, declaration)
          if (declaration.source) addReexport(reexports, declaration)
        }
        continue

    }

  }

  return { parsed, imports, importTypes, exports, exportTypes, reexports, reexportTypes }

}

function addImport (imports, declaration) {
  imports = getDefault(imports, declaration.source.value, new Map())
  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ImportSpecifier') {
      imports.set(specifier.local.name, specifier.imported.name)
    } else if (specifier.type === 'ImportDefaultSpecifier') {
      imports.set(specifier.local.name, 'default')
    }
  }
}

function addExport (exports, declaration) {
  if (declaration.declaration) {
    if (declaration.declaration.id) {
      exports.add(declaration.declaration.id.name)
    }
    if (declaration.declaration.declarations) {
      for (const { id: { name } } of declaration.declaration.declarations) {
        exports.add(name)
      }
    }
  }
  for (const specifier of declaration.specifiers) {
    exports.add(specifier.exported.name)
  }
}

function addExportDefault (exports, declaration) {
  exports.add('default')
}

function addReexport (reexports, declaration) {
  reexports = getDefault(reexports, declaration.source.value, new Map())
  for (const specifier of declaration.specifiers) {
    if (specifier.type === 'ExportSpecifier') {
      reexports.set(specifier.exported.name, specifier.local.name)
    } else if (specifier.type === 'ExportDefaultSpecifier') {
      reexports.set(specifier.exported.name, 'default')
    }
  }
}

/** Get a key in a map, setting it to provided default if missing. */
export function getDefault (map, key, def) {
  if (map.has(key)) {
    return map.get(key)
  } else {
    map.set(key, def)
    return def
  }
}

export function redirectToRelative (resolver, subPackages, dry) {
  const pkg = resolver.get('package.json')
  console.log('Merging the following packages:', ...subPackages)
  for (let path of subPackages) redirectToRelativePackage({
    resolver, path, dry
  })
}

export function redirectToRelativePackage ({
  resolver = Error.required('resolver'),
  path     = Error.required('path'),
  dry      = true
}) {
  path = `${path}/package.json`
  const subPkg = resolver.get(path)
  if (!subPkg) {
    throw new Error(`missing in resolver: ${path}`)
  }
  const { name = Error.required(`name (in ${path})`) } = subPkg.parse()
  const prefix = `${name}/`
  path = join(resolver.root, path)

  resolver.forEach(entry => {
    if (!(entry instanceof TSFile)) return
    redirectToRelativePackageEntry({ resolver, name, path, prefix, entry })
  })

  resolver.forEach(entry => {
    if (!entry.modified) return
    const code = recast.print(entry.parsed).code
    if (dry) {
      console.log('(dry run) not saving:', bold(entry.path))
    } else {
      console.log('save:', bold(entry.path))
      writeFileSync(entry.path, code)
    }
  })
}

export function redirectToRelativePackageEntry ({
  resolver = Error.required('resolver'),
  name     = Error.required('name'),
  path     = Error.required('path'),
  prefix   = Error.required('prefix'),
  entry    = Error.required('entry { path, parsed }')
}) {
  recast.visit(entry.parsed, {
    visitImportDeclaration (declaration) {
      const oldSpecifier = declaration.value.source.value
      const newSpecifier = getRelativeSpecifier({
        resolver, entry, path, prefix, specifier: oldSpecifier
      })
      markIfModified(entry, name, oldSpecifier, newSpecifier)
      declaration.value.source.value = newSpecifier
      return false
    },
    visitExportNamedDeclaration (declaration) {
      if (declaration.value.source) {
        const oldSpecifier = declaration.value.source.value
        const newSpecifier = getRelativeSpecifier({
          resolver, entry, path, prefix, specifier: oldSpecifier
        })
        markIfModified(entry, name, oldSpecifier, newSpecifier)
        declaration.value.source.value = newSpecifier
      }
      return false
    }
  })
}

export function getRelativeSpecifier ({
  resolver  = Error.required('resolver'),
  entry     = Error.required('entry { path, parsed }'),
  path      = Error.required('path'),
  prefix    = Error.required('prefix'),
  specifier = Error.required('specifier'),
} = {}) {
  if (specifier.startsWith(prefix)) {
    let subPrefix = relative(dirname(entry.path), resolver.root)
    const isRelative = (subPrefix === '..' || subPrefix.startsWith('../'))
    if (!isRelative) subPrefix = './' + subPrefix
    subPrefix = `${subPrefix}/${relative(resolver.root, dirname(path))}`
    const newSpecifier = `${subPrefix}/` + specifier.slice(prefix.length)
    console.log(' ', specifier, '->', newSpecifier)
    specifier = newSpecifier
  }
  return specifier
}

export function markIfModified (entry, name, specifier, newSpecifier) {
  if ((newSpecifier !== specifier) && !entry.modified) {
    console.log('replacing', bold(name), 'in', bold(entry.path))
    entry.modified = true
  }
}

export function printUsageOfMerge () {
  console.info('')
  console.info(`Usage of ${bold('ubik merge-package')}:`)
  console.info('')
  console.info('  ubik merge-package DIR [DIRS...] -- PACKAGE [PACKAGES...]')
  console.info('')
  console.info('Where:')
  console.info('')
  console.info('  - each DIR is a directory in your repo')
  console.info('    that contains source files to modify')
  console.info('')
  console.info('  - each PACKAGE is a directory in your repo')
  console.info('    that contains a package to be substituted;')
  console.info('')
  console.info('  - the "--" string separates one from the other')
  console.info('')
  console.info('This will modify all files under DIRS that import from')
  console.info('any of the PACKAGES (as named by $PACKAGE/package.json)')
  console.info('to instead import by relative path.')
  console.info('')
}
