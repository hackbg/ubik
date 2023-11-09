/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { readFileSync, writeFileSync } from 'node:fs'
import recast from 'recast'
import { recastTS } from '../shims.cjs'
import { console, bold } from '../tool/tool.mjs'

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
        console.log('Updating type annotation:', bold(before), '->', bold(after))
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
