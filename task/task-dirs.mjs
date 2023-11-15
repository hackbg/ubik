/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { relative, dirname } from 'node:path'
import { writeFileSync } from 'node:fs'
import { Resolve } from '../tool/tool.mjs'
import recast from 'recast'

import { Console, bold } from '@hackbg/logs'
const console = new Console('add directory index')

export function fixImportDirs (resolver, dry) {

  resolver.forEach(entry => {
    if (!(entry instanceof Resolve.TSFile)) return
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
