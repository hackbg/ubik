/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { relative } from 'node:path'
import { getDefault } from '../tool/tool-parse.mjs'
import { Console, bold } from '@hackbg/logs'
const console = new Console('@hackbg/ubik (split)')

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
