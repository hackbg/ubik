/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { relative, dirname, resolve, join as joinPath, sep } from 'node:path'
import recast from 'recast'
import { getImportsExports, getDefault } from './tool-parse.mjs'
import { separateTypeImports } from '../task/task-split.mjs'
import { Console, bold } from './tool-log.mjs'
const console = new Console('@hackbg/ubik (resolve)')

/** Join path fragments, enforcing Unix-style path separator. */
export function join (...fragments) {
  return joinPath(...fragments).split(sep).join('/')
}

/** The resolver class is the root of an Ubik run.
  * It keeps track of all paths that are part of the
  * codebase that is being modified. */
export class Resolver extends Map {
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
