/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import Package from './Package.mjs'
import TSCompiler from './TSCompiler.mjs'
for (const cwd of [
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-esm'),
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-cjs'),
]) {
  const compiler = new TSCompiler(cwd, { pkg: new Package('', { files: [] }), args: [] })
  assert(await compiler.compileAndPatch())
}
