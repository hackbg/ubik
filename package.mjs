/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { fileURLToPath } from 'node:url'
import { resolve, relative, dirname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { Console, bold, colors } from '@hackbg/logs'
const Package = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'))
const console = new Console(`@hackbg/ubik(${bold(Package.version)})`)
export { Package as default, console, bold, colors }
