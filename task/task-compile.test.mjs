/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Compile from './task-compile.mjs'
for (const cwd of [
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-esm'),
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-cjs'),
]) {

  assert(await Compile.prepareTypeScript({ cwd, pkgJson: { main: "" }, args: [] }))

  //assert.ok(Compile.collectFiles({
    //name:    '',
    //srcDir:  '',
    //distDir: '',
    //ext1:    '',
    //ext2:    '',
  //}))

  assert(Compile.revertModifications({ cwd, keep: false, }))

  assert(Compile.revertModifications({ cwd, keep: true, }))

  for (const patch of [
    Compile.patchESMImports,
    Compile.patchDTSImports,
    Compile.patchCJSRequires,
  ]) {
    assert.ok(patch({ files: [] }))
  }

}
