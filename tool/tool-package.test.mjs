/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert, { equal, throws } from 'node:assert'
import * as Package from './tool-package.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

for (const cwd of [
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-esm'),
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-cjs'),
]) {
  assert(Package.determinePackageManager())

  equal('foo',  Package.determinePackageManager({
    verbose: true, packageManager: 'foo'
  }))

  equal('yarn', Package.determinePackageManager({
    verbose: true, yarnCheck: 'true', pnpmCheck: 'false'
  }))

  equal('pnpm', Package.determinePackageManager({
    verbose: true, yarnCheck: 'false', pnpmCheck: 'true'
  }))

  equal('npm',  Package.determinePackageManager({
    verbose: true, yarnCheck: 'false', pnpmCheck: 'false'
  }))

  //assert(Package.runPackageManager({ cwd, args: ['-v'] }) || true)

  assert(Package.readPackageJson({ cwd, }))

  throws(()=>Package.readPackageJson({ cwd, pkgJson: { ubik: true }, }))

  assert(Package.readPackageJson({ cwd, pkgJson: { ubik: true }, skipFixed: true }))

  assert(Package.readPackageJson({ cwd, pkgJson: { private: true }, }).skip)

  throws(()=>Package.patchPackageJson({
    pkgJson: { main: "something.js" },
    forceTS: true,
    distEsmExt: 'asdf',
    distCjsExt: 'qwer',
    distDtsExt: 'xzcv',
  }))
}
