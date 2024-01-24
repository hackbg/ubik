/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, dirname, basename, isAbsolute, relative, join } from 'node:path'
import { readFileSync } from 'node:fs'
import { execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import fetch from 'node-fetch'
import Error from './Error.mjs'
import Logged, { console, bold } from './Logged.mjs'
import Package, { determinePackageManager, runPackageManager } from './Package.mjs'
import runConcurrently from './run.mjs'
import Patcher from './Patcher.mjs'
import { readdirSync, existsSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { mkdirpSync } from 'mkdirp'
import { rimrafSync } from 'rimraf'
import fastGlob from 'fast-glob'

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
      const compiler = new Compiler(this.cwd, options)
      /** Do the TypeScript magic if necessary. */
      if (this.pkg.isTypeScript) {
				this.log('Compiling and patching TypeScript...')
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
    * @arg {string}   [options.ecmaVersion] passed from env
    */
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
    this.cwd = cwd
    this.pkg = pkg
    this.args = args
    this.dryRun = dryRun
    this.emit = emit
    this.verbose = verbose
    this.tsc = tsc
    this.ecmaVersion = ecmaVersion
    this.generated = new Set()
    this.keep = keep
  }

  async compileAndPatch () {
    this.pkg.ubik = true
    if (!this.pkg.main) {
      this.log.warn('No "main" in package.json, defaulting to index.ts')
      this.pkg.main = 'index.ts'
    }

    this.pkg.exports ||= {}
    this.pkg.exports = {
      ...this.pkg.exports, '.': {
        ...(typeof this.pkg.exports['.'] === 'object' ? this.pkg.exports : null) || {},
        'source': this.toRel(this.pkg.main)
      }
    }

    if (this.pkg.browser) {
      const ext = ((this.pkg.type === 'module')
        ? this.emit?.esm?.outputs
        : this.emit?.cjs?.outputs)
      const browser = this.toRel(replaceExtension(this.pkg.browser, '.ts', ext || '.dist.js'))
      this.pkg.exports = {
        ...this.pkg.exports, '.': {
          ...this.pkg.exports['.'],
          'browser': browser
        }
      }
      this.pkg.browser = browser
    }

    if (process.env.UBIK_DUAL) {
			this.log('Emitting CJS and ESM...')
      await this.emitDual()
    } else if (this.pkg.type === 'module') {
			this.log('Emitting ESM...')
      await this.emitESM()
    } else {
			this.log('Emitting CJS...')
      await this.emitCJS()
    }

    if (this.pkg.type !== 'module') {
      this.pkg.types = this.toRel(
        replaceExtension(this.pkg.main, '.ts', this.emit?.cjs?.types||'.dist.d.ts')
      )
      this.pkg.main = this.toRel(
        replaceExtension(this.pkg.main, '.ts', this.emit?.cjs?.outputs||'.dist.js')
      )
    } else {
      // 'default' key must go last, see https://stackoverflow.com/a/76127619 *asplode*
      this.pkg.types = this.toRel(
        replaceExtension(this.pkg.main, '.ts', this.emit?.esm?.types||'.dist.d.ts')
      )
      this.pkg.main = this.toRel(
        replaceExtension(this.pkg.main, '.ts', this.emit?.esm?.outputs||'.dist.js')
      )
    }

    this.pkg.files = [
      ...this.pkg.files,
      ...this.generated // FIXME: return from emit fns instead
    ]

    if (this.dryRun) {
      this.log.br().info(`Patched package.json:\n${this.pkg.stringified}`)
    } else {
      this.log.log("Backing up package.json to package.json.bak")
      copyFileSync(join(this.cwd, 'package.json'), join(this.cwd, 'package.json.bak'))
      writeFileSync(join(this.cwd, 'package.json'), this.pkg.stringified, 'utf8')
    }

    return this.generated
  }

  async emitDual ({
    esmModule     = process.env.UBIK_ESM_MODULE || 'esnext',
    esmTarget     = process.env.UBIK_ESM_TARGET || 'esnext',
    esmOutputs    = '.dist.mjs',
    esmSourceMaps = esmOutputs && '.dist.mjs.map',
    esmTypes      = esmOutputs && '.dist.d.mts',
    esmTypeMaps   = esmTypes   && '.dist.d.mts.map',
    cjsModule     = process.env.UBIK_CJS_MODULE || 'commonjs',
    cjsTarget     = process.env.UBIK_CJS_TARGET || 'esnext',
    cjsOutputs    = '.dist.cjs',
    cjsSourceMaps = esmOutputs && '.dist.cjs.map',
    cjsTypes      = esmOutputs && '.dist.d.cts',
    cjsTypeMaps   = esmTypes   && '.dist.d.cts.map',
  } = {}) {
    await Promise.all([
      this.emitESM({
        module:     esmModule,
        target:     esmTarget,
        outputs:    esmOutputs,
        sourceMaps: esmSourceMaps,
        types:      esmTypes,
        typeMaps:   esmTypeMaps,
      }),
      this.emitCJS({
        module:     cjsModule,
        target:     cjsTarget,
        outputs:    cjsOutputs,
        sourceMaps: cjsSourceMaps,
        types:      cjsTypes,
        typeMaps:   cjsTypeMaps,
      }),
    ])
  }

  async emitESM ({
    module = process.env.UBIK_ESM_MODULE || 'esnext',
    target = process.env.UBIK_ESM_TARGET || 'esnext',
    outputs    = '.dist.js',
    sourceMaps = outputs && '.dist.js.map',
    types      = outputs && '.dist.d.ts',
    typeMaps   = types && '.dist.d.ts.map',
  } = this.emit.esm || Error.required('ESM emit config')) {
    await this.emitPatched({
			out: this.cwd,
			cwd: resolve(this.cwd, '.ubik.cjs'),
      module,
			target,
			outputs,
			sourceMaps,
			types,
			typeMaps,
			CodePatcher: Patcher.MJS,
			TypePatcher: Patcher.MTS,
		})
    if (outputs) {
      const esmMain = this.toRel(replaceExtension(this.pkg.main, '.ts', outputs))
      this.pkg.exports = {
        ...this.pkg.exports, '.': { ...this.pkg.exports['.'], 'default': esmMain }
      }
    }
  }

  async emitCJS ({
    module = process.env.UBIK_CJS_MODULE || 'commonjs',
    target = process.env.UBIK_CJS_TARGET || 'esnext',
    outputs    = '.dist.js',
    sourceMaps = outputs && '.dist.js.map',
    types      = outputs && '.dist.d.ts',
    typeMaps   = types && '.dist.d.ts.map',
  } = this.emit.cjs || Error.required('CJS emit config')) {
    await this.emitPatched({
			out: this.cwd,
			cwd: resolve(this.cwd, '.ubik.cjs'),
      module,
			target,
			outputs,
			sourceMaps,
			types,
			typeMaps,
			CodePatcher: Patcher.CJS,
			TypePatcher: Patcher.CTS,
		})
    if (outputs) {
      const cjsMain = this.toRel(replaceExtension(this.pkg.main, '.ts', outputs))
      this.pkg.exports = {
        ...this.pkg.exports, '.': { ...this.pkg.exports['.'], 'require': cjsMain }
      }
    }
  }

  /** @arg {string} module setting
    * @arg {string} target setting
    *
    * @arg {string} outputs    extension
    * @arg {string} sourceMaps extension
    * @arg {string} types      extension
    * @arg {string} typeMaps   extension
    *
    * @arg {typeof Patcher} CodePatcher implementation
    * @art {typeof Patcher} TypePatcher implementation */
  async emitPatched ({
		out = this.cwd,
		cwd = resolve(out, '.ubik'),
    module,
		target,
		outputs,
		sourceMaps,
		types,
		typeMaps,
		CodePatcher,
		TypePatcher,
	}) {
    const dryRun = this.dryRun
    if (outputs||sourceMaps||types||typeMaps) {
      rimrafSync(cwd)
      mkdirpSync(cwd)
      await this.run([this.tsc,
        '--target', target,
        '--module', module,
				'--moduleResolution', 'node10',
        '--outDir', cwd,
				'--esModuleInterop',
        sourceMaps && '--sourceMap',
        types      && '--declaration',
        typeMaps   && '--declarationMap',
      ].join(' '))
      if (outputs) {
        await this.revertable(`patch ${outputs}`,
          ()=>new CodePatcher({cwd, dryRun}).patchAll(outputs))
        await this.revertable(`collect ${outputs}`,
          ()=>this.collect(cwd, '.js', out, outputs))
        if (sourceMaps) {
          await this.revertable(`collect ${sourceMaps}`,
            ()=>this.collect(cwd, '.js.map', out, sourceMaps))
        }
      }
      if (types) {
        await this.revertable(`patch ${types}`,
          ()=>new TypePatcher({cwd, dryRun}).patchAll(types))
        await this.revertable(`collect ${outputs}`,
          ()=>this.collect(cwd, '.d.ts', out, types))
        if (typeMaps) {
          await this.revertable(`collect ${typeMaps}`,
            ()=>this.collect(cwd, '.d.ts.map', out, typeMaps))
        }
      }
      rimrafSync(cwd)
    }
  }

  async collect (
    tempDir = Error.required('tempDir') || '',
    tempExt = Error.required('tempExt') || '',
    outDir  = Error.required('outDir')  || '',
    outExt  = Error.required('outExt')  || '',
  ) {
    this.log.debug(
      `Collecting from ${bold(this.toRel(tempDir))}: ${bold(tempExt)} -> ${bold(`${outExt}`)}`
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
      if (this.verbose) {
        this.log.debug(`${this.toRel(srcFile)} -> ${this.toRel(outFile)}`)
      }
      copyFileSync(srcFile, outFile)
      unlinkSync(srcFile)
      outputs.push(outFile)
      this.generated.add(this.toRel(outFile))
    }
    //console.log({globs, inputs, outputs})
    //console.log(await fastGlob(['!node_modules', '!**/node_modules', '.ubik/*']))
  }

  run (...commands) {
    this.log.debug('Running in', bold(resolve(this.cwd)))
    return runConcurrently({ cwd: this.cwd, commands })
  }

  toRel (...args) {
    return toRel(this.cwd, ...args)
  }

  revertable (name, fn) {
    try { return fn() } catch (e) { this.onError(name)(e) }
  }

  onError (source) {
    return e => {
      this.log.br().error(
        `${bold(source)} failed:`,
        bold(e.message)+'\n'+e.stack.slice(e.stack.indexOf('\n'))
      )
      this.revert()
      throw e
    }
  }

  revert () {
    if (this.keep) {
      this.log.br().warn(
        "Not restoring original 'package.json'; keeping build artifacts."
      ).warn(
        "Your package is now in a *modified* state: make sure you don't commit it by accident!"
      ).warn(
        "When you're done inspecting the intermediate results, " +
        "rename 'package.json.bak' back to 'package.json'"
      )
      return true
    }
    this.log.br().log('Reverting modifications...')
    if (!existsSync(join(this.cwd, 'package.json.bak'))) {
      this.log.warn("Backup file package.json.bak not found")
    } else {
      this.log.log("Restoring original package.json")
      unlinkSync(join(this.cwd, 'package.json'))
      copyFileSync(join(this.cwd, 'package.json.bak'), join(this.cwd, 'package.json'))
      unlinkSync(join(this.cwd, 'package.json.bak'))
    }
    this.log.log('Deleting generated files...')
    for (const file of [...this.generated].sort()) {
      this.log.debug('Deleting', file)
      unlinkSync(file)
    }
    return true
  }

}

// Changes x.a to x.b:
export function replaceExtension (x, a, b) {
  return join(dirname(x), `${basename(x, a)}${b}`)
}

// Convert absolute path to relative
export function toRel (cwd, path) {
  return `./${isAbsolute(path)?relative(cwd, path):path}`
}
