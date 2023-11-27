import Package from './Package.mjs'
import Logged, { bold } from './Logged.mjs'
import runConcurrently from './run.mjs'
import Error from './Error.mjs'
import Patcher from './Patcher.mjs'

import { resolve, dirname, basename, relative, join, isAbsolute } from 'node:path'
import { readdirSync, existsSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { mkdirpSync } from 'mkdirp'
import { rimrafSync } from 'rimraf'
import fastGlob from 'fast-glob'

export default class Compiler extends Logged {
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

    const collect = async (
      tempDir = Error.required('tempDir') || '',
      tempExt = Error.required('tempExt') || '',
      outDir  = Error.required('outDir')  || '',
      outExt  = Error.required('outExt')  || '',
    ) => {
      this.log.log(`Collecting from ${bold(this.toRel(tempDir))}: ${bold(outExt)} -> ${bold(`${tempExt}`)}`)
      const glob1 = `${tempDir}/*${outExt}`
      const glob2 = `${tempDir}/**/*${outExt}`
      const globs = ['!node_modules', '!**/node_modules', glob1, glob2]
      const inputs = await fastGlob(globs)
      const outputs = []
      for (const file of inputs.filter(file=>file.endsWith(outExt))) {
        const srcFile = resolve(file)
        const outFile = replaceExtension(
          join(outDir, relative(tempDir, file)), outExt, tempExt
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
      //console.log(await fastGlob(['!node_modules', '!**/node_modules', '*']))
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
              tempDir, this.cwd, '.d.ts.map', typeMaps
            ))
          }
        }

      }

    }

    pkg.files.unshift('*.dist.*', '**/*.dist.*')

    if (!pkg.main) {
      this.log.warn('No "main" in package.json, defaulting to index.ts')
      pkg.main = 'index.ts'
    }

    pkg.exports ??= {}

    pkg.exports['.'] ??= {}

    const main = pkg.main
    pkg.exports['.']['source'] = this.toRel(main)
    this.log.log(`exports["."]["source"] = ${pkg.exports['.']['source']}`)

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
        this.log.log(`exports["."]["default"] = ${esmMain}`)
        pkg.exports['.']['default'] = esmMain

        if (pkg.browser) {
          const esmBrowser = this.toRel(replaceExtension(pkg.browser, '.ts', outputs))
          this.log.info('Handling alternate "browser" entrypoint for ESM only.')
          pkg.exports['.']['browser'] = esmBrowser
          this.log.log(`exports["."]["browser"] = ${esmBrowser}`)
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
