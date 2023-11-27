/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import Logged, { Console, bold } from './Logged.mjs'
import Error from './Error.mjs'
import { acornParse, TSFile } from './Resolver.mjs'

import { resolve, dirname, relative } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import recast from 'recast'
import * as acornWalk from 'acorn-walk'
import * as astring from 'astring'
import { recastTS } from '../shims.cjs'

const console = new Console('@hackbg/ubik')

export default class Patcher extends Logged {

  constructor ({ cwd = process.cwd(), dryRun = true, files = [], ext }) {
    super()
    this.cwd     = cwd
    this.dryRun  = dryRun
    this.files   = files
    this.patched = {}
    this.ext     = ext
  }

  patchAll () {
    this.log.log(`Patching ${this.files.length} files`)
    for (let i = 0; i < this.files.length; i++) {
      this.patch({ file: this.files[i], index: i+1, total: this.files.length })
    }
    return this.patched
  }

  patch ({ file, index, total }) {
    throw new Error('abstract')
    return this.patched
  }
  
  savePatched (modified, file, src) {
    if (modified) {
      this.patched[file] = src
      if (!this.dryRun) {
        writeFileSync(file, this.patched[file], 'utf8')
      }
    }
    return this.patched
  }

  static esmDeclarationsToPatch = [
    'ImportDeclaration',
    'ExportDeclaration',
    'ImportAllDeclaration',
    'ExportAllDeclaration',
    'ExportNamedDeclaration'
  ]

  static MJS = class MJSPatcher extends Patcher {
    patch ({
      file    = Error.required('file'),
      source  = readFileSync(resolve(this.cwd, file), 'utf8'),
      ast     = acornParse(file, source),
      index   = 0,
      total   = 0,
    }) {
      file = resolve(this.cwd, file)
      let modified = false
      //@ts-ignore
      const { body } = ast
      for (const declaration of body) {
        if (!Patcher.esmDeclarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
        const oldValue = declaration.source.value
        const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
        const isNotPatched = !oldValue.endsWith(this.ext)
        if (isRelative && isNotPatched) {
          if (!modified) {
            this.log.log(`(${index}/${total})`, 'Patching', bold(relative(this.cwd, file)))
          }
          const newValue = `${oldValue}${this.ext}`
          this.log.debug(' ', oldValue, '->', newValue)
          Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
          modified = true
        }
      }
      return this.savePatched(modified, file, astring.generate(ast))
    }
  }

  static MTS = class MTSPatcher extends Patcher {
    patch ({
      file    = Error.required('file'),
      source  = readFileSync(resolve(this.cwd, file), 'utf8'),
      parsed  = recast.parse(source, { parser: recastTS }),
      index   = 0,
      total   = 0,
    }) {
      file = resolve(this.cwd, file)
      let modified = false
      for (const declaration of parsed.program.body) {
        if (!Patcher.esmDeclarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
        const oldValue = declaration.source.value
        const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
        const isNotPatched = !oldValue.endsWith(this.ext)
        if (isRelative && isNotPatched) {
          if (!modified) {
            this.log.log(`(${index}/${total})`, 'Patching', bold(relative(this.cwd, file)))
          }
          const newValue = `${oldValue}.dist`
          this.log.debug(' ', oldValue, '->', newValue)
          Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
          modified = true
        }
      }
      return this.savePatched(modified, file, recast.print(parsed).code)
    }
  }

  static CJS = class CJSPatcher extends Patcher {
    patch ({
      file    = Error.required('file'),
      source  = readFileSync(resolve(this.cwd, file), 'utf8'),
      ast     = acornParse(file, source),
      index   = 0,
      total   = 0,
    }) {
      const { cwd, log, ext } = this
      file = resolve(cwd, file)
      let modified = false
      acornWalk.simple(ast, {
        CallExpression (node) {
          //@ts-ignore
          const { callee: { type, name }, loc: { start: { line, column } } } = node
          const args = node['arguments']
          if (
            type === 'Identifier' &&
            name === 'require' // GOTCHA: if "require" is renamed to something else, idk
          ) {
            if (args.length === 1 && args[0].type === 'Literal') {
              const value = args[0].value
              if (value.startsWith('./') || value.startsWith('../')) {
                const target = `${resolve(dirname(file), value)}.ts`
                if (existsSync(target)) {
                  if (!modified) {
                    log.log(`(${index}/${total})`, 'Patching', bold(relative(cwd, file)))
                  }
                  const newValue = `${value}${ext}`
                  log.debug(`  require("${value}") -> require("${newValue}")`)
                  args[0].value = newValue
                  args[0].raw = JSON.stringify(newValue)
                  modified = true
                } else {
                  log.warn(`  require("${bold(value)}"): ${bold(target)} not found, ignoring`)
                }
              }
            } else {
              log.warn(
                `Dynamic or non-standard require() call encountered at ${file}:${line}:${column}. `+
                `\n\n${recast.print(node).code}\n\n`+
                `This library only patches calls of the format "require('./my-module')".'\n` +
                `File an issue at https://github.com/hackbg/ubik if you need to patch ` +
                `more complex require calls.`
              )
            }
          }

        }
      })
      return this.savePatched(modified, file, astring.generate(ast))
    }
  }

  static CTS = class CTSPatcher extends Patcher {
    patch (args) {
      throw new Error('unimplemented')
      return this.patched
    }
  }

}

export function fixImportDirs (resolver, dry) {

  resolver.forEach(entry => {
    if (!(entry instanceof TSFile)) return
    recast.visit(entry.parsed, {
      visitImportDeclaration,
      visitExportAllDeclaration,
      visitExportNamedDeclaration
    })

    function visitImportDeclaration (declaration) {
      const oldSpecifier = declaration.value.source.value
      const newSpecifier = enforceFileSpecifier(resolver, entry, oldSpecifier)
      markIfModified(entry, oldSpecifier, newSpecifier)
      declaration.value.source.value = newSpecifier
      return false
    }

    function visitExportAllDeclaration (declaration) {
      if (declaration.value.source) {
        const oldSpecifier = declaration.value.source.value
        const newSpecifier = enforceFileSpecifier(resolver, entry, oldSpecifier)
        markIfModified(entry, oldSpecifier, newSpecifier)
        declaration.value.source.value = newSpecifier
      }
      return false
    }

    function visitExportNamedDeclaration (declaration) {
      if (declaration.value.source) {
        const oldSpecifier = declaration.value.source.value
        const newSpecifier = enforceFileSpecifier(resolver, entry, oldSpecifier)
        markIfModified(entry, oldSpecifier, newSpecifier)
        declaration.value.source.value = newSpecifier
      }
      return false
    }
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

function markIfModified (entry, specifier, newSpecifier) {
  if ((newSpecifier !== specifier) && !entry.modified) {
    console.log(`in ${bold(entry.path)}:`, bold(specifier), '->', bold(newSpecifier))
    entry.modified = true
  }
}

function enforceFileSpecifier (resolver, entry, specifier) {
  const resolved = resolver.resolve(entry.path, specifier)
  if (resolved) {
    // Append `/index` to the import source if trying to import from directory.
    if (
      // The `/index.ts` part is added by Directory#resolve
      resolved.path.endsWith('/index.ts') &&
      // Nothing to do if the import already contains `/index`
      !specifier.endsWith('/index')
    ) {
      specifier += '/index'
    }
  } else if (specifier.startsWith('.')) {
    // Throw if a relative import was not found.
    throw new Error(`failed resolving ${specifier} from ${entry.path}`)
  }
  return specifier
}

const parse = source => recast.parse(source, { parser: recastTS })

export function separateNamespaceImport ({
  path,
  packageName,
  dryRun = true
}) {
  const source = readFileSync(path, 'utf8')
  const parsed = parse(source)

  // Find a declaration of the form:
  //   import * as foo from "foobar"
  // And change it to:
  //   import * as __foo from "foobar"
  //   import type * as _foo from "foobar"
  //   //@ts-ignore
  //   const foo = __foo['default']
  let name
  for (let index = 0; index < parsed.program.body.length; index++) {
    const node = parsed.program.body[index]
    // Skip everything that is not an import declaration
    if (node.type !== 'ImportDeclaration') {
      continue
    }
    // If this is an import star from the specified module:
    if (
      node.importKind === 'value' &&
      node.source.value === packageName
    ) {
      name = node.specifiers[0].local.name
      const before = recast.print(node).code
      console
        .warn(`This doesn't check if "${node.source.value}" is really a CommonJS module!`)
        .warn(`If "${node.source.value}" is already a valid ES Module, this will just break stuff.`)
        .log('Fixing import of CommonJS as ESM. This:')
        .log(' ', bold(before))
      // Prefix value import
      node.specifiers[0].local.name = `__${name}`
      const after = recast.print(node).code
      const typeImport = `import type * as _${name} from "${packageName}"`
      const destructuring = [`\n//@ts-ignore`, `const ${name} = __${name}['default']`]
      console
        .log('becomes this:')
        .log(' ', bold(after))
        .log(' ', bold(typeImport))
        .log(' ', bold(destructuring[0].trim()))
        .log(' ', bold(destructuring[1]))
      // Add type import
      parsed.program.body.splice(index + 1, 0, ...parse(typeImport).program.body)
      // Add destructuring expression
      parsed.program.body.splice(index + 2, 0, ...parse(destructuring.join('\n')).program.body)
      // And we're done with this stage of the fix
      break
    }
  }

  if (!name) {
    console.warn(bold(packageName), 'not found in', bold(path))
    return source
  }

  // Change every type annotation of the form `foo.Bar` to `_foo.Bar`
  recast.visit(parsed, {
    visitTSTypeReference (path) {
      if (
        path.value.typeName &&
        path.value.typeName.type === 'TSQualifiedName' &&
        path.value.typeName.left.type === 'Identifier' &&
        path.value.typeName.left.name === name
      ) {
        const name = path.value.typeName.left.name
        const before = recast.print(path.value).code
        path.value.typeName.left.name = `_${name}`
        const after = recast.print(path.value).code
        console.debug('Updating type annotation:', bold(before), '->', bold(after))
      }
      this.traverse(path)
    }
  })

  const result = recast.print(parsed).code

  if (!dryRun) {
    writeFileSync(path, result)
  }

  return result

}