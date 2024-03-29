/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import Logged, { bold } from './Logged.mjs'
import Error from './Error.mjs'

import { readFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { execSync, execFileSync } from 'node:child_process'

export default class NPMPackage extends Logged {
  #json
  constructor (
    cwd, data = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'))
  ) {
    super()
    this.cwd = cwd
    this.#json = data
    this.log.label += ' ' + this[Symbol.toStringTag]
    Object.defineProperty(this, 'cwd', { configurable: true, enumerable: false })
  }

  get [Symbol.toStringTag] () {
    return `${this.name}@${this.version} (${relative(process.cwd(), this.cwd)})`
  }

  get versionedName () {
    return `${this.name.replace('@','').replace('/','_')}_${this.version}`
  }
  get name () {
    return this.#json.name || ''
  }
  get version () {
    return this.#json.version || ''
  }
  get type () {
    return this.#json.type || ''
  }
  get module () {
    return this.#json.module || ''
  }
  get main () {
    return this.#json.main || ''
  }
  set main (val) {
    if (!(typeof val === 'string')) {
      throw new Error('main must be string')
    }
    this.log.debug('Setting', bold('main'), 'to', val)
    this.#json.main = val
  }
  get browser () {
    return this.#json.browser || ''
  }
  set browser (val) {
    if (!(typeof val === 'string')) {
      throw new Error('browser must be string')
    }
    this.log.debug('Setting', bold('browser'), 'to', val)
    this.#json.browser = val
  }
  get types () {
    return this.#json.types || ''
  }
  set types (val) {
    if (!(typeof val === 'string')) {
      throw new Error('types must be string')
    }
    this.log.debug('Setting', bold('types'), 'to', val)
    this.#json.types = val
  }
  get exports () {
    return this.#json.exports
  }
  set exports (val) {
    if (!(val instanceof Object)) {
      throw new Error('exports must be object')
    }
    this.log.debug('Setting', bold('exports'), 'to', JSON.stringify(val, null, 2))
    this.#json.exports = val
  }
  get files () {
    return this.#json.files || []
  }
  set files (val) {
    if (!(val instanceof Array)) {
      throw new Error('files must be array')
    }
    this.log.debug('Setting', bold('files'), 'to', val)
    this.#json.files = val
  }
  get private () {
    return !!this.#json.private
  }
  get ubik () {
    return this.#json.ubik
  }
  set ubik (val) {
    this.log.debug('Setting', bold('ubik'), 'to', val)
    this.#json.ubik = !!val
  }
  get isTypeScript () {
    return !!(process.env.UBIK_FORCE_TS) || this.main.endsWith('.ts')
  }
  get stringified () {
    return JSON.stringify(this.#json, null, 2)
  }
}

/** Determine which package manager to use: */
export function determinePackageManager ({
  packageManager = process.env.UBIK_PACKAGE_MANAGER,
  verbose        = !!process.env.UBIK_VERBOSE,
  yarnCheck      = 'yarn version',
  pnpmCheck      = 'pnpm --version',
} = {}) {
  if (packageManager) {
    return packageManager
  }

  packageManager = 'npm'

  try {
    execSync(yarnCheck)
    packageManager = 'yarn'
  } catch (e) {
    if (verbose) console.info('Yarn: not installed')
  }

  try {
    execSync(pnpmCheck)
    packageManager = 'pnpm'
  } catch (e) {
    if (verbose) console.info('PNPM: not installed')
  }

  if (verbose) console.info(
    `Using package manager:`, bold(packageManager),
    `(set`, bold('UBIK_PACKAGE_MANAGER'), 'to change)'
  )

  return packageManager
}

/** Run the selected package manager. */
export function runPackageManager ({
  cwd = process.cwd(),
  npm = determinePackageManager(),
  args = []
} = {}) {
  return execFileSync(npm, args, {
    cwd,
    stdio: 'inherit',
    env: process.env
  })
}
