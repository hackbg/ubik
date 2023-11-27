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
    * @arg {Partial<Package>} [options.pkg]
    * @arg {string[]}         [options.args]
    * @arg {boolean}          [options.verbose]
    * @arg {boolean}          [options.dryRun]
    * @arg {object}           [options.emit]
    * @arg {boolean}          [options.keep]
    * @arg {string}           [options.tsc]
    * @arg {string}           [options.ecmaVersion]
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
    this.compiled = new Set()
  }

  async compileAndPatch () {
    const { cwd, pkg } = this

    pkg.ubik = true

    const revertable = (name, fn) => {
      try { return fn() } catch (e) { this.onError(name)(e) }
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
    const emitPatched = async (
      module, target, outputs, sourceMaps, types, typeMaps, CodePatcher, TypePatcher
    ) => {

      if (outputs||sourceMaps||types||typeMaps) {

        const tempDir = resolve(this.cwd, '.ubik')
        rimrafSync(tempDir)
        mkdirpSync(tempDir)

        await this.run([this.tsc,
          '--target', target,
          '--module', module,
          '--outDir', tempDir,
          sourceMaps && '--sourceMap',
          types      && '--declaration',
          typeMaps   && '--declarationMap',
        ].join(' '))

        if (outputs) {
          revertable(`patch ${outputs}`, ()=>new CodePatcher({
            cwd:    tempDir,
            dryRun: this.dryRun,
            ext:    outputs,
            files:  this.pkg.files.filter(x=>x.endsWith('.js'))
          }).patchAll())
          await revertable(`collect ${outputs}`, ()=>collect(
            tempDir, '.js', cwd, outputs
          ))
          if (sourceMaps) {
            await revertable(`collect ${sourceMaps}`, ()=>collect(
              tempDir, '.js.map', cwd, sourceMaps
            ))
          }
        }

        if (types) {
          revertable(`patch ${types}`, ()=>new TypePatcher({
            cwd:    tempDir,
            dryRun: this.dryRun,
            ext:    types,
            files:  this.pkg.files.filter(x=>x.endsWith('.d.ts'))
          }).patchAll())
          await revertable(`collect ${outputs}`, ()=>collect(
            tempDir, '.d.ts', cwd, types
          ))
          if (typeMaps) {
            await revertable(`collect ${typeMaps}`, ()=>collect(
              tempDir, '.d.ts.map', cwd, typeMaps
            ))
          }
        }

        rimrafSync(tempDir)

      }

    }

    const collect = async (
      tempDir = Error.required('tempDir') || '',
      tempExt = Error.required('tempExt') || '',
      outDir  = Error.required('outDir')  || '',
      outExt  = Error.required('outExt')  || '',
    ) => {
      this.log.debug(`Collecting from ${bold(this.toRel(tempDir))}: ${bold(tempExt)} -> ${bold(`${outExt}`)}`)
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
        this.compiled.add(this.toRel(outFile))
      }
      //console.log({globs, inputs, outputs})
      //console.log(await fastGlob(['!node_modules', '!**/node_modules', '.ubik/*']))
    }

    pkg.files = [ ...pkg.files, ...this.compiled ]

    if (!pkg.main) {
      this.log.warn('No "main" in package.json, defaulting to index.ts')
      pkg.main = 'index.ts'
    }

    pkg.exports ??= {}

    pkg.exports = { ...pkg.exports, '.': pkg.exports['.'] ?? {} }

    const main = pkg.main
    pkg.exports = { ...pkg.exports, '.': { ...pkg.exports['.'], 'source': this.toRel(main) } }

    if (this.emit?.esm) {
      const {
        module = process.env.UBIK_ESM_MODULE || 'esnext',
        target = process.env.UBIK_ESM_TARGET || 'esnext',
        outputs    = '.dist.mjs',
        sourceMaps = outputs && '.dist.mjs.map',
        types      = outputs && '.dist.d.mts',
        typeMaps   = types && '.dist.d.mts.map',
      } = this.emit.esm
      await emitPatched(
        module, target, outputs, sourceMaps, types, typeMaps, Patcher.MJS, Patcher.MTS
      )
      if (outputs) {

        const esmMain = this.toRel(replaceExtension(main, '.ts', outputs))
        pkg.exports = { ...pkg.exports, '.': { ...pkg.exports['.'], 'default': esmMain } }

        if (pkg.browser) {
          const esmBrowser = this.toRel(replaceExtension(pkg.browser, '.ts', outputs))
          this.log.info('Handling alternate "browser" entrypoint for ESM only.')
          pkg.exports = { ...pkg.exports, '.': { ...pkg.exports['.'], 'browser': esmBrowser } }
          pkg.browser = esmBrowser
          this.log.log(`browser = ${esmBrowser}`)
        }

        if (pkg.type === 'module') {
          pkg.main = esmMain
          if (types) {
            pkg.types = replaceExtension(main, '.ts', types)
          }
        }
      }
    }

    if (this.emit?.cjs) {
      const {
        module = process.env.UBIK_CJS_MODULE || 'commonjs',
        target = process.env.UBIK_CJS_TARGET || 'esnext',
        outputs    = '.dist.cjs',
        sourceMaps = outputs && '.dist.cjs.map',
        types      = outputs && '.dist.d.cts',
        typeMaps   = types && '.dist.d.cts.map',
      } = this.emit.cjs
      await emitPatched(
        module, target, outputs, sourceMaps, types, typeMaps, Patcher.CJS, Patcher.CTS
      )
      if (outputs) {
        const cjsMain = this.toRel(replaceExtension(main, '.ts', outputs))
        pkg.exports['.']['require'] = cjsMain
        this.log.log(`exports["."]["require"] = ${pkg.exports['.']['require']}`)

        if (!(pkg.type === 'module')) {
          pkg.main = cjsMain
          if (types) {
            pkg.types = replaceExtension(main, '.ts', types)
          }
        }
      }

    }

    if (this.dryRun) {
      this.log.br().info(`Published package.json would be:\n${this.pkg.stringified}`)
    } else {
      this.log.log("Backing up package.json to package.json.bak")
      copyFileSync(join(this.cwd, 'package.json'), join(this.cwd, 'package.json.bak'))
      writeFileSync(join(this.cwd, 'package.json'), this.pkg.stringified, 'utf8')
    }

    return this.compiled
  }

  run (...commands) {
    this.log.debug('Running in', bold(resolve(this.cwd)))
    return runConcurrently({ cwd: this.cwd, commands })
  }

  onError (source) {
    return e => {
      this.log.br().error(
        `${bold(source)} failed:`,
        bold(e.message)+'\n'+e.stack.slice(e.stack.indexOf('\n'))
      )
      this.revert({ keep: false, compiled: this.compiled })
      throw e
    }
  }

  toRel (...args) {
    return toRel(this.cwd, ...args)
  }

  revert ({ keep = false, compiled = new Set(), } = {}) {
    if (keep) {
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
      this.log.br().warn("Backup file package.json.bak not found")
    } else {
      this.log.br().log("Restoring original package.json")
      unlinkSync(join(this.cwd, 'package.json'))
      copyFileSync(join(this.cwd, 'package.json.bak'), join(this.cwd, 'package.json'))
      unlinkSync(join(this.cwd, 'package.json.bak'))
    }
    this.log.br().log('Deleting generated files...')
    for (const file of compiled) {
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
