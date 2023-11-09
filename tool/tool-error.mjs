/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { bold } from '@hackbg/logs'

export function required (name) {
  throw new UbikError(`Required: ${bold(name)}`)
  return undefined
}

export class UbikError extends Error {}
