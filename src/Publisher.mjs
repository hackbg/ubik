/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, dirname, relative, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import fetch from 'node-fetch'
import Error from './Error.mjs'
import Logged, { console, bold } from './Logged.mjs'
import Package, { determinePackageManager, runPackageManager } from './Package.mjs'
import TSCompiler from './TSCompiler.mjs'

export function printPublishUsage () {
}

export default class Publisher extends Logged {

  constructor (cwd, {
    pkg = new Package(cwd),
    /** Verbose logging mode. */
    verbose = !!(process.env.UBIK_VERBOSE || process.env.VERBOSE),
    /** Whether to keep the modified package.json and dist files */
    keep = false,
    /** Whether to actually publish to NPM, or just go through the movements ("dry run")  */
    dryRun = true,
    /** Publish args. */
    args = [],
    /** Package manager to use. */
    npm = determinePackageManager(),
    /** Git binary to use. */
    git = 'git',
    /** Fetch function to use */
    fetch = globalThis.fetch,
  } = {}) {
    super()
    this.cwd = cwd
    this.pkg = pkg
    this.verbose = verbose
    this.keep = keep
    this.dryRun = dryRun
    this.fetch = fetch
    this.args = args
    this.npm = npm
    this.git = git
  }

  async releasePackage () {
    if (this.pkg.private) {
      this.log.info('Skipping private package:', this.pkg.name)
      return true
    }
    if (this.pkg.ubik && !!process.env.UBIK_SKIP_FIXED) {
      this.log.warn('Skipping patched package:', this.pkg.name)
      return true
    }
    const previousCwd = process.cwd()
    try {
      process.chdir(this.cwd)
      this.log.debug('Working in', process.cwd())
      const { name, version } = this.pkg
      /** Make sure Git tag doesn't exist. */
      let tag
      if (name) {
        tag = this.ensureFreshTag()
      }
      /** Second deduplication: Make sure the library is not already published. */
      if (await this.isPublished()) {
        console.warn(
          bold(version), 'is already published. Increment version in package.json to publish.'
        )
        return
      }
      /** Print the contents of package.json if we'll be publishing. */
      if (this.verbose) {
        console.log(`Original package.json:\n${JSON.stringify(this.pkg, null, 2)}`)
      }
      /** In wet mode, try a dry run first. */
      if (!this.dryRun) {
        this.preliminaryDryRun()
      } else {
        this.args = makeSureRunIsDry(this.args)
      }
      const options = { dryRun: this.dryRun, pkg: this.pkg, args: this.args, keep: this.keep }
      const compiler = new TSCompiler(this.cwd, options)
      /** Do the TypeScript magic if necessary. */
      if (this.pkg.isTypeScript) {
        await compiler.compileAndPatch()
      }
      try {
        /** If this is not a dry run, publish to NPM */
        if (!this.dryRun) {
          this.performRelease()
          if (!this.args.includes('--dry-run') && tag) {
            this.tagRelease({ tag })
          }
        } else {
          console.log('Dry run successful:', tag)
        }
      } catch (e) {
        /** Restore everything to a (near-)pristine state. */
        compiler.revert()
        throw e
      }
      compiler.revert()
      this.log.debug('Returning to', previousCwd)
      process.chdir(previousCwd)
      return this.pkg
    } finally {
      this.log.debug('Returning to', previousCwd)
      process.chdir(previousCwd)
    }
  }

  performRelease () {
    console.log(`${this.npm} publish`, ...this.args)
    return runPackageManager({
      cwd: this.cwd,
      npm: this.npm,
      args: ['publish', '--no-git-checks', ...this.args]
    })
  }

  tagRelease ({
    tag    = undefined,
    noTag  = Boolean(process.env.UBIK_NO_TAG),
    noPush = Boolean(process.env.UBIK_NO_PUSH),
  } = {}) {
    console.br().log('Published:', tag)
    // Add Git tag
    if (noTag) {
      return {}
    }
    execSync(
      `${this.git} tag -f "${tag}"`,
      { cwd: this.cwd, stdio: 'inherit' }
    )
    if (noPush) {
      return { tag }
    }
    execSync(
      `${this.git} push --tags`,
      { cwd: this.cwd, stdio: 'inherit' }
    )
    return {
      tag,
      pushed: true
    }
  }

  /** Bail if Git tag already exists.
    * @arg {{ name: string, version: string }} pkg */
  ensureFreshTag ({ name, version } = this.pkg) {
    if (!name) {
      throw new Error('missing package name')
    }
    if (!version) {
      throw new Error('missing package version')
    }
    const tag = `npm/${name}/${version}`
    try {
      execFileSync(this.git, ['rev-parse', tag], {
        cwd: this.cwd,
        env: process.env,
        //@ts-ignore
        stdio: 'inherit',
      })
      throw new Error.TagAlreadyExists(tag)
    } catch (e) {
      if (this.verbose) {
        console.log(`Git tag "${tag}" not found`)
      }
      return tag
    }
  }

  /** @arg {{ name: string, version: string }} pkg */
  async isPublished ({ name, version } = this.pkg) {
    if (!name) {
      throw new Error('missing package name')
    }
    if (!version) {
      throw new Error('missing package version')
    }
    const url = `https://registry.npmjs.org/${name}/${version}` 
    const response = await this.fetch(url)
    if (response.status === 200) {
      if (this.verbose) {
        console.log(`NPM package ${name} ${version} already exists.`)
      }
      if (!this.dryRun) {
        console.log(`OK, not publishing:`, url)
      }
      return true
    } else if (response.status !== 404) {
      throw new Error.NPMErrorCode(response.status, name, version)
    }
    return false
  }

  preliminaryDryRun () {
    return runPackageManager({ cwd: this.cwd, args: ['publish', '--dry-run', ...this.args] })
  }

}

export function makeSureRunIsDry (publishArgs = []) {
  if (!publishArgs.includes('--dry-run')) {
    publishArgs = ['--dry-run', ...publishArgs]
  }
  return publishArgs
}
