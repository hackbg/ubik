/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert from 'node:assert'
import { Resolver, TSFile } from '../tool/tool-resolve.mjs'
import * as Merge from '../task/task-merge.mjs'
import { fixture } from '../.fixtures/fixtures.mjs'

Merge.printUsageOfMerge()

Merge.markIfModified()

const resolver = new Resolver('.fixtures/merge').load(['api', 'lib', 'types'])

Merge.getRelativeSpecifier({
  resolver,
  entry:     { path: '', parsed: '' },
  path:      '',
  prefix:    '',
  specifier: '',
})

Merge.redirectToRelativePackageEntry({
  resolver,
  entry:     { path: '', parsed: '' },
  name:      '',
  path:      '',
  prefix:    '',
})

Merge.redirectToRelativePackage({
  resolver,
  path: 'types',
  dry: true
})

Merge.redirectToRelative(resolver, ['types'])
