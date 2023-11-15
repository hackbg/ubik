/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import recast from 'recast'
import { recastTS } from '../shims.cjs'
import { Console, bold } from './tool-log.mjs'
const console = new Console('@hackbg/ubik (parse)')

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
