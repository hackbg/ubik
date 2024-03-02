/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, dirname, basename, isAbsolute, relative, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import fetch from 'node-fetch'
import { readdirSync, existsSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { mkdirpSync } from 'mkdirp'
import { rimrafSync } from 'rimraf'
import fastGlob from 'fast-glob'

import Error from './Error.mjs'
import Logged, { console, bold } from './Logged.mjs'
import Package, { determinePackageManager, runPackageManager } from './Package.mjs'
import runConcurrently from './run.mjs'
import Patcher, { MJSPatcher, MTSPatcher, CJSPatcher, CTSPatcher } from './Patcher.mjs'

export class Publisher extends Logged {
  static printUsage () {}
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
    /** Extension fragment denoting a compiled file. */
    compiled = process.env.UBIK_DIST || '.dist'
  } = {}) {
    super()
    this.cwd     = cwd
    this.pkg     = pkg
    this.verbose = verbose
    this.keep    = keep
    this.dryRun  = dryRun
    this.fetch   = fetch
    this.args    = args
    this.npm     = npm
    this.git     = git
  }
  /** Run a Git command. */
  runGit = (command) => execSync(`${this.git} ${command}`, { cwd: this.cwd, stdio: 'inherit' })
  /** Do a full release. */
  releasePackage = () => releasePackage(this)
  /** Publish to NPM. */
  publishToNPM = () => publishToNPM(this)
  /** Add a Git tag. */
  tagRelease = (options) => tagRelease(this, options)
  /** Bail if Git tag already exists. */
  ensureFreshTag = () => ensureFreshTag(this)
  /** Check if package is already published. */
  isPublished = () => isPublished(this)
  /** Run a package manager publish with dry run. */
  preliminaryDryRun = () => preliminaryDryRun(this)
}

export class Compiler extends Logged {
  static printUsage () {}
  /** @arg {string} [cwd] root directory of package
    * @arg {object} [options]
    *
    * @arg {Partial<Package>} [options.pkg] auto created from cwd
    *
    * @arg {string[]} [options.args] passed from cli
    * @arg {boolean}  [options.verbose] passed from env
    * @arg {boolean}  [options.dryRun] passed from cli
    * @arg {object}   [options.emit] defaults to emit everything
    * @arg {boolean}  [options.keep] defaults to false if publishing
    * @arg {string}   [options.tsc] passed from env
    * @arg {string}   [options.ecmaVersion] passed from env */
  constructor (cwd = process.cwd(), options) {
    const {
      verbose = !!process.env.VERBOSE,
      pkg     = new Package(cwd),
      args    = [],
      keep    = false,
      dryRun  = true,
      tsc     = process.env.UBIK_TSC || 'tsc',
      emit    = { esm: {}, cjs: {} },
      ecmaVersion = process.env.UBIK_ECMA || 'latest',
    } = options || {}
    super()
    this.cwd         = cwd
    this.pkg         = pkg
    this.args        = args
    this.dryRun      = dryRun
    this.emit        = emit
    this.verbose     = verbose
    this.tsc         = tsc
    this.ecmaVersion = ecmaVersion
    this.generated   = new Set()
    this.keep        = keep
    this.extensions  = {
      esm: {
        outputs:    '.dist.mjs',
        sourceMaps: '.dist.mjs.map',
        types:      '.dist.d.mts',
        typeMaps:   '.dist.d.mts.map',
      },
      cjs: {
        outputs:    '.dist.cjs',
        sourceMaps: '.dist.cjs.map',
        types:      '.dist.d.cts',
        typeMaps:   '.dist.d.cts.map',
      },
    }
  }
  /** Compile source, patch outputs, collect them, and update package.json data. */
  compileAndPatch = () =>
    compileAndPatch(this)
  /** Compile and patch in a single mode.
    * @arg {string} outDir              - path to output directory
    * @arg {typeof Patcher} CodePatcher - patcher for code
    * @arg {typeof Patcher} TypePatcher - patcher for types
    * @arg {Object} options             - options
    * @arg {string} options.module      - tsconfig module setting
    * @arg {string} options.target      - tsconfig target setting
    * @arg {string} options.outputs     - code file extension
    * @arg {string} options.sourceMaps  - source map file extension
    * @arg {string} options.types       - type declaration file extension
    * @arg {string} options.typeMaps    - declaration map file extension */
  emitPatched = (outDir, CodePatcher, TypePatcher, options) =>
    emitPatched(this, outDir, CodePatcher, TypePatcher, options)
  /** Collect files from temporary subdirectories into package root. */
  collect = (tempDir, tempExt, outDir, outExt) =>
    collect(this, tempDir, tempExt, outDir, outExt)
  /** Revert to original package state. */
  revert = () =>
    revert(this)
  /** Run one or more commands. */
  run = (...commands) => {
    this.log.log(`Running ${commands.length} command(s) in`, bold(resolve(this.cwd))+':')
    return runConcurrently({ cwd: this.cwd, commands })
  }
  /** Output a path relative to cwd. */
  toRel = (...args) => toRel(this.cwd, ...args)
  /** A revertable operation. */
  revertable = (name, fn) => {
    this.log.debug('Revertable:', bold(name))
    try { return fn() } catch (e) { this.onError(name)(e) }
  }
  /** On error, revert. */
  onError = (source) => e => {
    this.log.br().error(
      `${bold(source)} failed:`,
      bold(e.message)+'\n'+e.stack.slice(e.stack.indexOf('\n'))
    )
    this.revert()
    throw e
  }
}

async function releasePackage ({
  pkg, log, cwd, args, keep, verbose, dryRun,
  ensureFreshTag, isPublished, preliminaryDryRun, tagRelease, publishToNPM
}) {
  if (pkg.private) {
    log.info('Skipping private package:', pkg.name)
    return true
  }
  if (pkg.ubik && !!process.env.UBIK_SKIP_FIXED) {
    log.warn('Skipping patched package:', pkg.name)
    return true
  }
  const previousCwd = process.cwd()
  try {
    process.chdir(cwd)
    log.debug('Working in', process.cwd())
    const { name, version } = pkg
    /** Make sure Git tag doesn't exist. */
    let tag
    if (name) {
      tag = await ensureFreshTag()
    }
    /** Second deduplication: Make sure the library is not already published. */
    if (await isPublished()) {
      console.warn(
        bold(version), 'is already published. Increment version in package.json to publish.'
      )
      return
    }
    /** Print the contents of package.json if we'll be publishing. */
    if (verbose) {
      console.log(`Original package.json:\n${JSON.stringify(pkg, null, 2)}`)
    }
    /** In wet mode, try a dry run first. */
    if (!dryRun) {
      preliminaryDryRun()
    } else {
      args = makeSureRunIsDry(args)
    }
    const compiler = new Compiler(cwd, { dryRun, pkg, args, keep })
    /** Do the TypeScript magic if necessary. */
    if (pkg.isTypeScript) {
      await compiler.compileAndPatch()
    }
    try {
      /** If is not a dry run, publish to NPM */
      if (dryRun) {
        console.log('Dry run successful:', tag)
      } else {
        publishToNPM()
        if (!args.includes('--dry-run') && tag) {
          tagRelease({ tag })
        }
      }
    } catch (e) {
      /** Restore everything to a (near-)pristine state. */
      compiler.revert()
      throw e
    }
    compiler.revert()
    log.debug('Returning to', previousCwd)
    process.chdir(previousCwd)
    return pkg
  } finally {
    log.debug('Returning to', previousCwd)
    process.chdir(previousCwd)
  }
}

function publishToNPM ({ npm, args, cwd }) {
  console.log(`${npm} publish`, ...args)
  return runPackageManager({ cwd, npm, args: ['publish', '--no-git-checks', ...args] })
}

function tagRelease ({ log, runGit }, {
  tag    = undefined,
  noTag  = Boolean(process.env.UBIK_NO_TAG),
  noPush = Boolean(process.env.UBIK_NO_PUSH),
} = {}) {
  log.br().log('Published:', tag)
  // Add Git tag
  if (noTag) return {}
  runGit(`tag -f "${tag}"`)
  if (noPush) return { tag }
  runGit('push --tags')
  return { tag, pushed: true }
}

async function ensureFreshTag ({ pkg: { name, version }, git, cwd, verbose }) {
  if (!name) {
    throw new Error('missing package name')
  }
  if (!version) {
    throw new Error('missing package version')
  }
  const tag = `npm/${name}/${version}`
  try {
    execFileSync(git, ['rev-parse', tag], {
      cwd,
      env: process.env,
      //@ts-ignore
      stdio: 'inherit',
    })
    throw new Error.TagAlreadyExists(tag)
  } catch (e) {
    if (verbose) {
      console.log(`Git tag "${tag}" not found`)
    }
    return tag
  }
}

async function isPublished ({ pkg: { name, version }, verbose, dryRun, fetch }) {
  if (!name) {
    throw new Error('missing package name')
  }
  if (!version) {
    throw new Error('missing package version')
  }
  const url = `https://registry.npmjs.org/${name}/${version}` 
  const response = await fetch(url)
  if (response.status === 200) {
    if (verbose) console.log(`NPM package ${name} ${version} already exists.`)
    if (!dryRun) console.log(`OK, not publishing:`, url)
    return true
  } else if (response.status !== 404) {
    throw new Error.NPMErrorCode(response.status, name, version)
  }
  return false
}

function preliminaryDryRun ({ cwd, args }) {
  return runPackageManager({ cwd, args: ['publish', '--dry-run', ...args] })
}

export function makeSureRunIsDry (publishArgs = []) {
  if (!publishArgs.includes('--dry-run')) {
    publishArgs = ['--dry-run', ...publishArgs]
  }
  return publishArgs
}

async function compileAndPatch (
  { cwd, pkg, log, toRel, extensions, generated, dryRun, emitPatched },
) {
  // Set ubik flag in package. This is so that Ubik does not process the same package twice.
  pkg.ubik = true
  // Set default main entrypoint of module if missing.
  if (!pkg.main) {
    log.warn('No "main" in package.json, defaulting to index.ts')
    pkg.main = 'index.ts'
  }
  // Inherit preset exports of package.
  pkg.exports ||= {}
  pkg.exports["."] ||= {}
  pkg.exports = { ...pkg.exports, '.': { ...pkg.exports, 'source': toRel(pkg.main) } }
  // If there's a browser-specific entrypoint, include it in the exports.
  if (pkg.browser) {
    pkg.browser = toRel(replaceExtension(pkg.browser, '.ts', extensions.esm.outputs))
    pkg.exports = { ...pkg.exports, '.': { ...pkg.exports['.'], 'browser': pkg.browser } }
  }
  // Emit CJS and ESM versions.
  await Promise.all([
    emitPatched(resolve(cwd, '.ubik-esm'), MJSPatcher, MTSPatcher, {
      module: process.env.UBIK_ESM_MODULE || 'esnext',
      target: process.env.UBIK_ESM_TARGET || 'esnext',
      ...extensions.esm}),
    emitPatched(resolve(cwd, '.ubik-cjs'), CJSPatcher, MTSPatcher, {
      module: process.env.UBIK_CJS_MODULE || 'commonjs',
      target: process.env.UBIK_CJS_TARGET || 'esnext',
      ...extensions.cjs})])
  // Set exports in package.json
  pkg.exports = { ...pkg.exports, '.': { ...pkg.exports['.'],
    'import': {
      'types': toRel(replaceExtension(pkg.main, '.ts', extensions.esm.types)),
      'default': toRel(replaceExtension(pkg.main, '.ts', extensions.esm.outputs)),
    },
    'require': {
      'types': toRel(replaceExtension(pkg.main, '.ts', extensions.cjs.types)),
      'default': toRel(replaceExtension(pkg.main, '.ts', extensions.cjs.outputs))
    },
    'types': toRel(
      replaceExtension(pkg.main, '.ts', (pkg.type === 'module')
        ? extensions.esm.types
        : extensions.cjs.types)),
    'default': toRel(
      replaceExtension(pkg.main, '.ts', (pkg.type === 'module')
        ? extensions.esm.outputs
        : extensions.cjs.outputs))}}
  // Set default entrypoints in package.json, depending on package type.
  if (pkg.type !== 'module') {
    Object.assign(pkg, {
      types: toRel(replaceExtension(pkg.main, '.ts', extensions.cjs.types)),
      main:  toRel(replaceExtension(pkg.main, '.ts', extensions.cjs.outputs))})
  } else {
    // 'default' key must go last, see https://stackoverflow.com/a/76127619 *asplode*
    Object.assign(pkg, {
      types: toRel(replaceExtension(pkg.main, '.ts', extensions.esm.types)),
      main:  toRel(replaceExtension(pkg.main, '.ts', extensions.esm.outputs))})
  }
  // Include generated files into package.
  pkg.files = [...pkg.files, ...generated]
  // Write package.json if it's not a dry run.
  if (dryRun) {
    log.br().info(`Contents of patched package.json:\n${pkg.stringified}`)
  } else {
    log.log("Backing up package.json to package.json.bak")
    copyFileSync(join(cwd, 'package.json'), join(cwd, 'package.json.bak'))
    writeFileSync(join(cwd, 'package.json'), pkg.stringified, 'utf8')
  }
  return generated
}

async function emitPatched (
  { dryRun, log, tsc, revertable, collect, cwd, run },
  outDir, CodePatcher, TypePatcher,
  { module, target, outputs, sourceMaps, types, typeMaps }
) {
  if (!(outputs||sourceMaps||types||typeMaps)) {
    log.log('No outputs enabled for this mode.')
    return
  }
  log.log('Creating empty', bold(outDir))
  rimrafSync(outDir)
  mkdirpSync(outDir)
  await run([tsc, '--target', target, '--module', module, '--outDir', outDir,
    sourceMaps && '--sourceMap',
    types      && '--declaration',
    typeMaps   && '--declarationMap',
  ].join(' '))
  if (outputs) {
    log.log('Collecting code from', bold(outDir))
    await revertable(`patch ${outputs}`,
      ()=>new CodePatcher({cwd: outDir, dryRun}).patchAll('.js'))
    await revertable(`collect ${outputs}`,
      ()=>collect(outDir, '.js', cwd, outputs))
    if (sourceMaps) await revertable(`collect ${sourceMaps}`,
      ()=>collect(outDir, '.js.map', cwd, sourceMaps))
  }
  if (types) {
    log.log('Collecting types from', bold(outDir))
    await revertable(`patch ${types}`,
      ()=>new TypePatcher({cwd: outDir, dryRun}).patchAll('.d.ts'))
    await revertable(`collect ${outputs}`,
      ()=>collect(outDir, '.d.ts', cwd, types))
    if (typeMaps) await revertable(`collect ${typeMaps}`,
      ()=>collect(outDir, '.d.ts.map', cwd, typeMaps))
  }
  log.log('Removing', bold(outDir))
  rimrafSync(outDir)
}

async function collect (
  { log, toRel, verbose, cwd, generated },
  tempDir = Error.required('tempDir') || '',
  tempExt = Error.required('tempExt') || '',
  outDir  = Error.required('outDir')  || '',
  outExt  = Error.required('outExt')  || '',
) {
  log.log(
    `Collecting from ${bold(toRel(tempDir))}: ${bold(tempExt)} -> ${bold(`${outExt}`)}`
  )
  const glob1 = `${tempDir}/*${tempExt}`
  const glob2 = `${tempDir}/**/*${tempExt}`
  const globs = ['!node_modules', '!**/node_modules', glob1, glob2]
  const inputs = await fastGlob(globs)
  const outputs = []
  for (const file of inputs.filter(file=>file.endsWith(tempExt))) {
    const srcFile = resolve(file)
    const outFile = replaceExtension(
      join(outDir, relative(tempDir, file)), tempExt, outExt
    )
    mkdirpSync(dirname(outFile))
    if (verbose) {
      log.debug(`${toRel(srcFile)} -> ${toRel(outFile)}`)
    }
    log.debug(
      'Collect', bold(relative(cwd, srcFile)), '->', bold(relative(cwd, outFile))
    )
    copyFileSync(srcFile, outFile)
    unlinkSync(srcFile)
    outputs.push(outFile)
    generated.add(toRel(outFile))
  }
}

function revert (
  { keep, log, cwd, generated }
) {
  if (keep) {
    log.br().warn(
      "Not restoring original 'package.json'; keeping build artifacts."
    ).warn(
      "Your package is now in a *modified* state: make sure you don't commit it by accident!"
    ).warn(
      "When you're done inspecting the intermediate results, " +
      "rename 'package.json.bak' back to 'package.json'"
    )
    return true
  }
  log.br().log('Reverting modifications...')
  if (!existsSync(join(cwd, 'package.json.bak'))) {
    log.warn("Backup file package.json.bak not found")
  } else {
    log.log("Restoring original package.json")
    const pjs = join(cwd, 'package.json')
    const bak = join(cwd, 'package.json.bak')
    unlinkSync(pjs)
    copyFileSync(bak, pjs)
    unlinkSync(bak)
  }
  log.log('Deleting generated files...')
  for (const file of [...generated].sort()) {
    log.debug('Deleting', file)
    unlinkSync(file)
  }
  return true
}

// Changes x.a to x.b:
export function replaceExtension (x, a, b) {
  return join(dirname(x), `${basename(x, a)}${b}`)
}

// Convert absolute path to relative
export function toRel (cwd, path) {
  return `./${isAbsolute(path)?relative(cwd, path):path}`
}
