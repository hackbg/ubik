/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Console, bold } from '@hackbg/logs'

const ubikPackageJson = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json')
const ubikVersion = JSON.parse(readFileSync(ubikPackageJson, 'utf8')).version
export const console = new Console(`@hackbg/ubik ${ubikVersion}`)
export { Console, bold }
