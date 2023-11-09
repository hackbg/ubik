/**

  Ubik: Publish package to NPM
  Copyright (C) 2023 Hack.bg

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.

**/

import { resolve, dirname, relative, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import fetch from 'node-fetch'

import {UbikError} from '../tool/error.mjs'
import {console, bold} from '../tool/logger.mjs'
import {prepareTypeScript, revertModifications} from './compile.mjs'
import {readPackageJson} from '../tool/packager.mjs'

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
export async function release ({
  cwd = process.cwd(),
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
  /** Whether the files should be compiled from TypeScript. */
  isTypeScript = process.env.UBIK_FORCE_TS 
} = {}) {
  process.chdir(cwd)

  /** Need the contents of package.json and a way to restore it after modification. */
  const { packageJson, skip } = readPackageJson({ cwd })
  const { name, version } = packageJson
  if (skip) {
    return
  }
  /** First deduplication: Make sure the Git tag doesn't exist. */
  const tag = ensureFreshTag(name, version)
  /** Second deduplication: Make sure the library is not already published. */
  if (await isPublished({ name, version, dryRun, fetch })) {
    console.warn(
      bold(version), 'is already published. Increment version in package.json to publish.'
    )
    return
  }
  /** Print the contents of package.json if we'll be publishing. */
  if (process.env.UBIK_VERBOSE) console.log('Original package.json:', JSON.stringify(packageJson))
  /** In wet mode, try a dry run first. */
  if (!dryRun) {
    preliminaryDryRun({ cwd, args })
  } else {
    makeSureRunIsDry(args)
  }
  /** Determine if this is a TypeScript package that needs to be compiled and patched. */
  isTypeScript ||= (packageJson.main||'').endsWith('.ts')
  let distFiles = new Set()
  try {
    /** Do the TypeScript magic if it's necessary. */
    if (isTypeScript) {
      distFiles = await prepareTypeScript({ cwd, dryRun, packageJson, args, keep })
    }
    /** If this is not a dry run, publish to NPM */
    if (!dryRun) {
      performRelease({ cwd, npm, args })
      tagRelease({ cwd, tag, git })
    } else {
      console.log('Dry run successful:', tag)
    }
  } catch (e) {
    /** Restore everything to a (near-)pristine state. */
    revertModifications({ cwd, keep, distFiles })
    throw e
  }
  revertModifications({ cwd, keep, distFiles })
  return packageJson
}

export function performRelease ({
  cwd = process.cwd(),
  npm = determinePackageManager(),
  args = []
} = {}) {
  console.log(`${npm} publish`, ...args)
  return runPackageManager({ cwd, npm, args: ['publish', '--no-git-checks', ...args] })
}

export function tagRelease ({
  cwd = process.cwd(),
  tag = undefined,
  noTag  = process.env.UBIK_NO_TAG  || false,
  noPush = process.env.UBIK_NO_PUSH || false,
  git = 'git'
} = {}) {
  console.log('Published:', tag)
  // Add Git tag
  if (noTag) return
  execSync(`${git} tag -f "${tag}"`, { cwd, stdio: 'inherit' })
  if (noPush) return
  execSync(`${git} push --tags`, { cwd, stdio: 'inherit' })
}

// Bail if Git tag already exists
export function ensureFreshTag (name, version) {
  const tag = `npm/${name}/${version}`
  try {
    execFileSync('git', ['rev-parse'], tag, { cwd, stdio: 'inherit', env: process.env })
    throw new UbikError.TagAlreadyExists(tag)
  } catch (e) {
    if (process.env.UBIK_VERBOSE) console.log(`Git tag "${tag}" not found`)
    return tag
  }
}

export async function isPublished ({
  name,
  version,
  url = `https://registry.npmjs.org/${name}/${version}`,
  fetch = globalThis.fetch,
  dryRun = true,
  verbose = process.env.UBIK_VERBOSE
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
    throw new UbikError.NPMErrorCode(response.status, name, version)
  }
  return false
}

export function preliminaryDryRun ({ cwd, args }) {
  return runPackageManager({ cwd, args: ['publish', '--dry-run', ...args] })
}

export function makeSureRunIsDry (publishArgs = []) {
  if (!publishArgs.includes('--dry-run')) publishArgs.unshift('--dry-run')
}

/** Determine which package manager to use: */
export function determinePackageManager ({
  packageManager = process.env.UBIK_PACKAGE_MANAGER,
  verbose        = process.env.UBIK_VERBOSE,
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
  cwd,
  npm  = determinePackageManager(),
  args = []
} = {}) {
  return execFileSync(npm, args, { cwd, stdio: 'inherit', env: process.env })
}
