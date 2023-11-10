/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, dirname, relative, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import fetch from 'node-fetch'
import {UbikError, console, bold, required, Package} from '../tool/tool.mjs'
import * as Compile from './task-compile.mjs'

export function printPublishUsage () {
  console.info(
    `Usage:\n
    ${bold('ubik fix')}   - apply compatibility fix without publishing
    ${bold('ubik dry')}   - test publishing of package with compatibility fix
    ${bold('ubik wet')}   - publish package with compatibility fix
    ${bold('ubik clean')} - delete compiled files`
  )
}

/** Perform a release. */
export async function release (cwd, {
  /** Whether to keep the modified package.json and dist files */
  keep = false,
  /** Whether to actually publish to NPM, or just go through the movements ("dry run")  */
  dryRun = true,
  /** Publish args. */
  args = [],
  /** Package manager to use. */
  npm = Package.determinePackageManager(),
  /** Git binary to use. */
  git = 'git',
  /** Fetch function to use */
  fetch = globalThis.fetch,
  /** Whether the files should be compiled from TypeScript. */
  isTypeScript = process.env.UBIK_FORCE_TS 
} = {}) {
  let previousCwd = process.cwd()
  process.chdir(cwd)
  /** Need the contents of package.json and a way to restore it after modification. */
  const { pkgJson, skip } = Package.readPackageJson({ cwd })
  const { name, version } = pkgJson
  if (skip) {
    return
  }
  /** First deduplication: Make sure the Git tag doesn't exist. */
  let tag
  if (name) {
    tag = ensureFreshTag({ cwd, name, version })
  }
  /** Second deduplication: Make sure the library is not already published. */
  if (await isPublished({ name, version, dryRun, fetch })) {
    console.warn(
      bold(version), 'is already published. Increment version in package.json to publish.'
    )
    return
  }
  /** Print the contents of package.json if we'll be publishing. */
  if (process.env.UBIK_VERBOSE) {
    console.log(`Original package.json:\n${JSON.stringify(pkgJson, null, 2)}`)
  }
  /** In wet mode, try a dry run first. */
  if (!dryRun) {
    preliminaryDryRun({ cwd, args })
  } else {
    args = makeSureRunIsDry(args)
  }
  /** Determine if this is a TypeScript package that needs to be compiled and patched. */
  isTypeScript ||= (pkgJson.main||'').endsWith('.ts')
  let distFiles = new Set()
  if (isTypeScript) {
    /** Do the TypeScript magic if necessary. */
    distFiles = await Compile.prepareTypeScript({ cwd, dryRun, pkgJson, args, keep })
  }
  try {
    /** If this is not a dry run, publish to NPM */
    if (!dryRun) {
      performRelease({ cwd, npm, args })
      if (tag) {
        tagRelease({ cwd, tag, git })
      }
    } else {
      console.log('Dry run successful:', tag)
    }
  } catch (e) {
    /** Restore everything to a (near-)pristine state. */
    Compile.revertModifications({ cwd, keep, distFiles })
    throw e
  }
  Compile.revertModifications({ cwd, keep, distFiles })
  process.chdir(previousCwd)
  return pkgJson
}

export function performRelease ({
  cwd = process.cwd(),
  npm = Package.determinePackageManager(),
  args = []
} = {}) {
  console.log(`${npm} publish`, ...args)
  return Package.runPackageManager({ cwd, npm, args: ['publish', '--no-git-checks', ...args] })
}

export function tagRelease ({
  cwd    = process.cwd(),
  tag    = undefined,
  noTag  = Boolean(process.env.UBIK_NO_TAG),
  noPush = Boolean(process.env.UBIK_NO_PUSH),
  git    = 'git'
} = {}) {
  console.log('Published:', tag)
  // Add Git tag
  if (noTag) return
  execSync(`${git} tag -f "${tag}"`, { cwd, stdio: 'inherit' })
  if (noPush) return
  execSync(`${git} push --tags`, { cwd, stdio: 'inherit' })
  return true
}

// Bail if Git tag already exists
export function ensureFreshTag ({
  cwd     = process.cwd(),
  name    = required('name'),
  version = required('version')
} = {}) {
  const tag = `npm/${name}/${version}`
  try {
    execFileSync('git', ['rev-parse', tag], {
      cwd: process.cwd(),
      env: process.env,
      //@ts-ignore
      stdio: 'inherit',
    })
    throw new TagAlreadyExists(tag)
  } catch (e) {
    if (process.env.UBIK_VERBOSE) console.log(`Git tag "${tag}" not found`)
    return tag
  }
}

export async function isPublished ({
  name,
  version,
  url     = `https://registry.npmjs.org/${name}/${version}`,
  fetch   = globalThis.fetch,
  dryRun  = true,
  verbose = Boolean(process.env.UBIK_VERBOSE)
}) {
  const response = await fetch(url)
  if (response.status === 200) {
    if (verbose) {
      console.log(`NPM package ${name} ${version} already exists.`)
    }
    if (!dryRun) {
      console.log(`OK, not publishing:`, url)
    }
    return true
  } else if (response.status !== 404) {
    throw new NPMErrorCode(response.status, name, version)
  }
  return false
}

export function preliminaryDryRun ({ cwd, args }) {
  return Package.runPackageManager({ cwd, args: ['publish', '--dry-run', ...args] })
}

export function makeSureRunIsDry (publishArgs = []) {
  if (!publishArgs.includes('--dry-run')) {
    publishArgs = ['--dry-run', ...publishArgs]
  }
  return publishArgs
}

export class TagAlreadyExists extends UbikError {
  constructor (tag) {
    super([
      `Git tag ${bold(tag)} already exists. `,
      `Increment version in package.json or delete tag to proceed.`
    ].join(' '))
  }
}

export class NPMErrorCode extends UbikError {
  constructor (code, name, version) {
    super([
      `ubik: NPM returned ${bold(String(code))}`,
      `when looking for ${bold(name)} @ ${bold(version)}`
    ].join(' '))
  }
}
