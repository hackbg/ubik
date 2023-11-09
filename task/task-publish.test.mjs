/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert, { equal, deepEqual, rejects } from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Package from '../tool/tool-package.mjs'
import { distDtsExt, distEsmExt, distCjsExt } from './task-compile.mjs'
import * as Publish from './task-publish.mjs'
import { rimraf } from 'rimraf'
import { fixture } from '../.fixtures/fixtures.mjs'

const previousCwd = process.cwd()
for (const cwd of [ fixture('publish-esm'), fixture('publish-cjs') ]) {
  try {
    await Publish.printPublishUsage()
    assert(Publish.ensureFreshTag({ name: 'foo', version: 'bar' }))
    assert(Publish.performRelease({ cwd, npm: 'true', args: [] }) || true)
    assert(Publish.tagRelease({ cwd, tag: 'test', git: 'true' }) || true)

    assert(await Publish.isPublished({
      verbose: true,
      dryRun: false,
      //@ts-ignore
      fetch: () => Promise.resolve({ status: 200 }),
    }))

    equal(await Publish.isPublished({
      //@ts-ignore
      fetch: () => Promise.resolve({ status: 404 })
    }), false)

    rejects(()=>Publish.isPublished({
      //@ts-ignore
      fetch: () => Promise.resolve({ status: 429 })
    }))

    deepEqual(Publish.makeSureRunIsDry(), ['--dry-run'])
    deepEqual(Publish.makeSureRunIsDry(['foo']), ['--dry-run', 'foo'])
    deepEqual(Publish.makeSureRunIsDry(['--dry-run', 'foo']), ['--dry-run', 'foo'])

    for (const type of ['script', 'module']) {
      assert(Package.patchPackageJson({
        cwd,
        pkgJson: { pkgJson: { type } },
        distDtsExt,
        distEsmExt,
        distCjsExt
      }))
    }

    assert(Publish.release(cwd, {
      dryRun: true, npm: 'true', git: 'true',
      //@ts-ignore
      fetch: () => Promise.resolve({ status: 404 })
    }))

  } finally {
    await rimraf(join(cwd, 'dist'))
    process.chdir(previousCwd)
  }
}
