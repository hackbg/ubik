/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert from 'node:assert'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { separateNamespaceImport } from '../task/task-stars.mjs'

const fixture = x => join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', x)

assert.equal(
  separateNamespaceImport({ path: fixture('stars.ts'), packageName: 'foobar' }),
  readFileSync(fixture('stars-fixed.ts'), 'utf8')
)
