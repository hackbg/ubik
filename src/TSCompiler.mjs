import Package from './Package.mjs'
import Logged, { bold } from './Logged.mjs'
import runConcurrently from './run.mjs'
import Error from './Error.mjs'
import Patcher from './Patcher.mjs'

import { dirname, basename, relative, join, isAbsolute } from 'node:path'
import { existsSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { mkdirpSync } from 'mkdirp'
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
      tsc     = 'tsc',
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
    this.distFiles = new Set(this.pkg.files)
  }

  run (...commands) {
    return runConcurrently({ cwd: this.cwd, commands })
  }

  onError (source) {
    return e => {
      this.log.br().error(`${bold(source)} failed:`, bold(e.message))
      this.revert({ keep: false, distFiles: this.distFiles })
      throw e
    }
  }

  toRel (...args) {
    return toRel(this.cwd, ...args)
  }

  async compileAndPatch () {
    if (this.verbose) {
      this.log.debug('Compiling TypeScript...')
    }
    this.pkg.ubik = true
    const revertable = (name, fn) => {
      try { fn() } catch (e) { this.onError(name)(e) }
    }
    /** @arg {string} module              setting
      * @arg {string} target              setting
      * @arg {string} outputs             extension
      * @arg {string} sourceMaps          extension
      * @arg {string} types               extension
      * @arg {string} typeMaps            extension
      * @arg {typeof Patcher} CodePatcher implementation
      * @art {typeof Patcher} TypePatcher implementation */
    const emitPatched = async (
      module, target, outputs, sourceMaps, types, typeMaps, CodePatcher, TypePatcher
    ) => {
      if (outputs||sourceMaps||types||typeMaps) {
        await this.run([this.tsc, '--target', target, '--module', module,
          '--outDir', this.cwd,
          sourceMaps && '--sourceMap',
          types      && '--declaration',
          typeMaps   && '--declarationMap',
        ].join(' '))
        if (outputs) {
          revertable(`patch ${outputs}`, ()=>new CodePatcher({
            cwd: this.cwd,
            dryRun: this.dryRun,
            ext: outputs,
            files: this.pkg.files.filter(x=>x.endsWith(outputs))
          }).patchAll())
        }
        if (types) {
          revertable(`patch ${types}`, ()=>new TypePatcher({
            cwd: this.cwd,
            dryRun: this.dryRun,
            ext: types,
            files: this.pkg.files.filter(x=>x.endsWith(types))
          }).patchAll())
        }
      }
    }
    if (this.emit?.esm) {
      const {
        module = process.env.UBIK_ESM_MODULE || 'esnext',
        target = process.env.UBIK_ESM_TARGET || 'esnext',
        outputs    =            '.dist.mjs',
        sourceMaps = outputs && '.dist.mjs.map',
        types      = outputs && '.dist.d.mts',
        typeMaps   = types   && '.dist.d.mts.map',
      } = this.emit.esm
      await emitPatched(
        module, target, outputs, sourceMaps, types, typeMaps, Patcher.MJS, Patcher.MTS
      )
    }
    if (this.emit?.cjs) {
      const {
        module = process.env.UBIK_CJS_MODULE || 'commonjs',
        target = process.env.UBIK_CJS_TARGET || 'esnext',
        outputs    =            '.dist.cjs',
        sourceMaps = outputs && '.dist.cjs.map',
        types      = outputs && '.dist.d.cts',
        typeMaps   = types   && '.dist.d.cts.map',
      } = this.emit.cjs
      await emitPatched(
        module, target, outputs, sourceMaps, types, typeMaps, Patcher.CJS, Patcher.CTS
      )
    }

    revertable('patch package.json', ()=>{

      const { cwd, pkg } = this

      // TODO

      //const { cwd, pkg } = this
      //const main = join(cwd, pkg.main || 'index.ts')
      //const browserMain = join(cwd, pkg.browser || 'index.browser.ts') // TODO
      //// Set "main", "types", and "exports" in package.json.
      //const esmMain = replaceExtension(main, '.ts', distEsmExt)
      //const cjsMain = replaceExtension(main, '.ts', distCjsExt)
      //const dtsMain = replaceExtension(main, '.ts', distDtsExt)
      //pkg.types = toRel(cwd, dtsMain)
      //pkg.exports ??= {}
      //if ((!!process.env.UBIK_FORCE_TS) && pkg.main.endsWith('.js')) {
        //this.log.error(
          //`${bold('UBIK_FORCE_TS')} is on, but "main" has "js" extension.`,
          //bold('Make "main" point to the TS index')
        //)
        //throw new WrongMainExtension()
      //}
      //if (pkg.type === 'module') {
        //pkg.main = toRel(cwd, esmMain)
        //pkg.exports["."] = {
          //"source":  toRel(cwd, main),
          //"require": toRel(cwd, cjsMain),
          //"default": toRel(cwd, esmMain)
        //}
      //} else {
        //pkg.main = toRel(cwd, esmMain)
        //pkg.exports["."] = {
          //"source":  toRel(cwd, main),
          //"import":  toRel(cwd, esmMain),
          //"default": toRel(cwd, cjsMain)
        //}
      //}

      return pkg

    })

    if (this.dryRun) {
      this.log.br().info(`Published package.json would be:\n${this.pkg.stringified}`)
    } else {
      this.log.log("Backing up package.json to package.json.bak")
      copyFileSync(join(this.cwd, 'package.json'), join(this.cwd, 'package.json.bak'))
      writeFileSync(join(this.cwd, 'package.json'), this.pkg.stringified, 'utf8')
    }

    return this.distFiles
  }

  revert ({ keep = false, distFiles = new Set(), } = {}) {
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
    for (const file of distFiles) {
      unlinkSync(file)
    }
    return true
  }

  async collect ({
    name      = Error.required('name')    || '',
    srcDir    = Error.required('srcDir')  || '',
    distDir   = Error.required('distDir') || '',
    ext1      = Error.required('ext1')    || '',
    ext2      = Error.required('ext2')    || '',
    distFiles = new Set(),
  } = {}) {
    this.log.br()
    const { debug: log } = this.log.sub(`collecting ${name}:`)
    log(`Collecting from`, bold(`${distDir}/**/*${ext1}`), 'into', bold(`./**/*${ext2}"`))
    const inputs = await fastGlob([
      '!node_modules',
      '!**/node_modules',
      `${distDir}/*${ext1}`,
      `${distDir}/**/*${ext1}`
    ])
    const outputs = []
    for (const file of inputs.filter(file=>file.endsWith(ext1))) {
      const srcFile = join(this.cwd, file)
      const newFile = replaceExtension(
        join(srcDir, relative(distDir, file)), ext1, ext2
      )
      mkdirpSync(dirname(newFile))
      log(`  ${toRel(this.cwd, srcFile)} -> ${toRel(this.cwd, newFile)}`)
      copyFileSync(srcFile, newFile)
      unlinkSync(srcFile)
      outputs.push(newFile)
      distFiles.add(newFile)
    }
    return outputs
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
