/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import Error from './Error.mjs'
import { Console, bold } from './Logged.mjs'

import { promisify } from 'node:util'
import { exec, execSync, execFileSync, spawnSync } from 'node:child_process'
import { relative } from 'node:path'

const execPromise = promisify(exec)

export default async function runConcurrently ({
  cwd      = process.cwd(),
  commands = [],
  verbose  = Boolean(process.env.UBIK_VERBOSE)
}) {
  const console = new Console(`Runner (${bold(relative(process.cwd(), cwd)||'.')})`)
  commands.forEach(command=>console.debug(command))
  let result
  try {
    return await Promise.all(commands.map(
      command=>execPromise(command, Object.assign({ cwd }, { stdio: 'inherit' }))
    ))
  } catch (e) {
    process.stdout.write(e.stdout)
    throw new Error.RunFailed(commands)
  }
}

export function runLong (cwd, cmd, ...args) {
  return spawnSync(cmd, args, { maxBuffer: Infinity, cwd }).stdout.toString()
}
