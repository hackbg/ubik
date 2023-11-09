/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { join, dirname, basename, isAbsolute, relative } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync, spawnSync } from 'node:child_process'
import { UbikError } from './tool-error.mjs'
import { Console, bold } from './tool-log.mjs'
const console = new Console('@hackbg/ubik (package)')

// Changes x.a to x.b:
export function replaceExtension (x, a, b) {
  return join(dirname(x), `${basename(x, a)}${b}`)
}

// Convert absolute path to relative
export function toRel (cwd, path) {
  return `./${isAbsolute(path)?relative(cwd, path):path}`
}

/** Load package.json. Bail if already modified. */
export function readPackageJson ({
  cwd       = process.cwd(),
  path      = join(cwd, 'package.json'),
  pkgJson   = JSON.parse(readFileSync(path, 'utf8')),
  skipFixed = Boolean(process.env.UBIK_SKIP_FIXED)
}) {
  if (pkgJson['ubik']) {
    if (skipFixed) {
      console.warn(`Package ${bold(pkgJson.name)} @ ${bold(pkgJson.version)} already contains key "ubik"; skipping.`)
      return { pkgJson, skip: true }
    } else {
      throw new ModifiedPackageJSON(path)
    }
  }
  if (pkgJson['private']) {
    console.log(`Package ${bold(pkgJson.name)} is private; skipping.`)
    return { pkgJson, skip: true }
  }
  return { pkgJson }
}

export class ModifiedPackageJSON extends UbikError {
  constructor (path) {
    super([
      `This is already the modified, temporary package.json. Restore the original ` +
      `(e.g. "mv package.json.bak package.json" or "git checkout package.json") and try again`
    ].join(' '))
    this.path = path
  }
}

export function patchPackageJson ({
  cwd     = process.cwd(),
  pkgJson = readPackageJson({ cwd }).pkgJson,
  forceTS = Boolean(process.env.UBIK_FORCE_TS),
  distEsmExt,
  distCjsExt,
  distDtsExt,
}) {
  const main        = join(cwd, pkgJson.main    || 'index.ts')
  const browserMain = join(cwd, pkgJson.browser || 'index.browser.ts') // TODO
  // Set "main", "types", and "exports" in package.json.
  const esmMain = replaceExtension(main, '.ts', distEsmExt)
  const cjsMain = replaceExtension(main, '.ts', distCjsExt)
  const dtsMain = replaceExtension(main, '.ts', distDtsExt)
  pkgJson.types = toRel(cwd, dtsMain)
  pkgJson.exports ??= {}
  if (forceTS && pkgJson.main.endsWith('.js')) {
    console.error(
      `${bold('UBIK_FORCE_TS')} is on, but "main" has "js" extension.`,
      bold('Make "main" point to the TS index')
    )
    throw new WrongMainExtension()
  }
  if (pkgJson.type === 'module') {
    pkgJson.main = toRel(cwd, esmMain)
    pkgJson.exports["."] = {
      "source":  toRel(cwd, main),
      "require": toRel(cwd, cjsMain),
      "default": toRel(cwd, esmMain)
    }
  } else {
    pkgJson.main = toRel(cwd, esmMain)
    pkgJson.exports["."] = {
      "source":  toRel(cwd, main),
      "import":  toRel(cwd, esmMain),
      "default": toRel(cwd, cjsMain)
    }
  }
  return pkgJson
}

export class WrongMainExtension extends UbikError {
  constructor () {
    super([
      'UBIK_FORCE_TS is on, but "main" has "js" extension.',
      'Make "main" point to the TS index'
    ].join(' '))
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
