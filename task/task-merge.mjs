/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { relative, dirname } from 'node:path'
import { writeFileSync } from 'node:fs'
import recast from 'recast'
import { Console, bold } from '@hackbg/logs'
import { UbikError, required } from '../tool/tool-error.mjs'
import { TSFile, join } from '../tool/tool-resolve.mjs'

const console = new Console('ubik: merge packages')

export function redirectToRelative (resolver, subPackages, dry) {
  const pkg = resolver.get('package.json')
  console.log('Merging the following packages:', ...subPackages)
  for (let path of subPackages) redirectToRelativePackage({
    resolver, path, dry
  })
}

export function redirectToRelativePackage ({
  resolver = required('resolver'),
  path     = required('path'),
  dry      = true
}) {
  path = `${path}/package.json`
  const subPkg = resolver.get(path)
  if (!subPkg) {
    throw new UbikError(`missing in resolver: ${path}`)
  }
  const { name = required(`name (in ${path})`) } = subPkg.parse()
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
  resolver = required('resolver'),
  name     = required('name'),
  path     = required('path'),
  prefix   = required('prefix'),
  entry    = required('entry { path, parsed }')
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
  resolver  = required('resolver'),
  entry     = required('entry { path, parsed }'),
  path      = required('path'),
  prefix    = required('prefix'),
  specifier = required('specifier'),
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
