/**

  Ubik
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

import { writeFileSync } from 'node:fs'

import recast from 'recast'

import { addTypeSection } from '../task/split.mjs'
import { addDirectorySuffix } from '../task/dirs.mjs'

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
      if (typeDeclaration) addDirectorySuffix(resolver, path, typeDeclaration)
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
        if (typeDeclaration) addDirectorySuffix(resolver, path, typeDeclaration)
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
