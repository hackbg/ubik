/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import Package from './Package.mjs'
import Patcher from './Patcher.mjs'
for (const cwd of [
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-esm'),
  join(dirname(fileURLToPath(import.meta.url)), '../.fixtures', 'publish-cjs'),
]) {
  assert.deepEqual(new Patcher.MJS({ cwd, dryRun: true, ext: '.dist.mjs' })
    .patch({ file: 'name', source: `import foo from './lib'`, }),
    { [resolve(cwd, 'name')]: `import foo from "./lib.dist.mjs";\n` })
  assert.deepEqual(new Patcher.MTS({ cwd, dryRun: true, ext: '.dist.d.mts' })
    .patch({ file: 'name', source: `import foo from './lib'`, }),
    { [resolve(cwd, 'name')]: `import foo from "./lib.dist"` })
  assert.deepEqual(new Patcher.CJS({ cwd, dryRun: true, ext: '.dist.cjs' })
    .patch({ file: 'name', source: `const foo = require('./lib')`, }),
    { [resolve(cwd, 'name')]: `const foo = require("./lib.dist.cjs");\n` })
  assert.deepEqual(new Patcher.CJS({ cwd, dryRun: true, ext: '.dist.cjs' })
    .patch({ file: 'name', source: `const foo = require('./lib-missing')`, }),
    {})
  assert.deepEqual(new Patcher.CJS({ cwd, dryRun: true, ext: '.dist.cjs' })
    .patch({ file: 'name', source: `const foo = require('./lib'+dynamic)`, }),
    {})
}
