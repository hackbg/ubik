/**

  Ubik: Split undifferentiated type imports
  Copyright (C) 2023 Hack.bg

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.

**/

import { getDefault } from '../tool/parser.mjs'

import { Console, bold } from '@hackbg/logs'
const console = new Console('@hackbg/ubik')

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
    console.log(`into ${bold(path)} from ${bold(target)}:`)
    updateImportExport(
      'importing from', resolver, path, target, specifiers, newImports, newImportTypes
    )
  }

  // For every `export from` declaration in current module:
  for (const [target, specifiers] of reexports.entries()) {
    console.log(``)
    console.log(`thru ${bold(path)} from ${bold(target)}:`)
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
  mode, resolver, path, target, specifiers, newValues, newTypes,
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
    console.log(specifier)
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
