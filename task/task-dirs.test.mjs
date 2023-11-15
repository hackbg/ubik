/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { Resolver } from '../tool/tool-resolve.mjs'
import * as Dirs from './task-dirs.mjs'

const resolver = new Resolver('.fixtures/merge').load(['api', 'lib', 'types'])
Dirs.fixImportDirs(resolver, true)
