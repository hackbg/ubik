/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { UbikError } from './tool-error.mjs'
import { Console, bold } from './tool-log.mjs'
import { promisify } from 'node:util'
import { exec } from 'node:child_process'

const console = new Console('@hackbg/ubik (run)')

const execPromise = promisify(exec)

export async function runConcurrently ({
  cwd      = process.cwd(),
  commands = [],
  verbose  = Boolean(process.env.UBIK_VERBOSE)
}) {
  console.br().log(`Running ${bold(commands.length)} commands in ${bold(cwd)}:`)
  commands.forEach(command=>console.log(' ', command))
  let result
  try {
    return await Promise.all(commands.map(
      command=>execPromise(command, Object.assign({ cwd }, { stdio: 'inherit' }))
    ))
  } catch (e) {
    process.stdout.write(e.stdout)
    throw new RunFailed(commands)
  }
}

export class RunFailed extends UbikError {
  constructor (commands = []) {
    super('Running external commands failed. See log output for details.')
    this.commands = commands
  }
}
