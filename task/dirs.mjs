/**

  Ubik: Point directory imports to directory index
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

import { relative, dirname } from 'node:path'
import { writeFileSync } from 'node:fs'

import { TSFile } from '../tool/resolver.mjs'

import recast from 'recast'

import { Console, bold } from '@hackbg/logs'
const console = new Console('add directory index')

export default function fixImportDirs (resolver, dry) {

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
