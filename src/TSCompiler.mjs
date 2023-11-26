import Package from './Package.mjs'
import Logged, { bold } from './Logged.mjs'
import runConcurrently from './run.mjs'
import Error from './Error.mjs'
import { acornParse } from './parse.mjs'

import { resolve, dirname, basename, relative, join, isAbsolute } from 'node:path'
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { mkdirpSync } from 'mkdirp'
import recast from 'recast'
import * as acornWalk from 'acorn-walk'
import * as astring from 'astring'
import fastGlob from 'fast-glob'
import { recastTS } from '../shims.cjs'

export default class TSCompiler extends Logged {
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
      await emitPatched(module, target, outputs, sourceMaps, types, typeMaps, MJSPatcher, MTSPatcher)
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
      await emitPatched(module, target, outputs, sourceMaps, types, typeMaps, CJSPatcher, CTSPatcher)
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

export class Patcher extends Logged {

  constructor ({ cwd = process.cwd(), dryRun = true, files = [], ext }) {
    super()
    this.cwd     = cwd
    this.dryRun  = dryRun
    this.files   = files
    this.patched = {}
    this.ext     = ext
  }

  patchAll () {
    this.log.br().log(`Patching ${this.files.length} files`)
    for (let i = 0; i < this.files.length; i++) {
      this.patch({ file: this.files[i], index: i+1, total: this.files.length })
    }
    return this.patched
  }

  patch ({ file, index, total }) {
    throw new Error('abstract')
    return this.patched
  }

}

class ESMPatcher extends Patcher {
  static declarationsToPatch = [
    'ImportDeclaration',
    'ExportDeclaration',
    'ImportAllDeclaration',
    'ExportAllDeclaration',
    'ExportNamedDeclaration'
  ]
}

export class MJSPatcher extends ESMPatcher {

  patch ({
    file    = Error.required('file'),
    source  = readFileSync(resolve(this.cwd, file), 'utf8'),
    ast     = acornParse(file, source),
    index   = 0,
    total   = 0,
  }) {
    file = resolve(this.cwd, file)
    let modified = false
    //@ts-ignore
    const { body } = ast
    for (const declaration of body) {
      if (!MJSPatcher.declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
      const oldValue = declaration.source.value
      const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
      const isNotPatched = !oldValue.endsWith(this.ext)
      if (isRelative && isNotPatched) {
        if (!modified) {
          this.log.log(`(${index}/${total})`, 'Patching', bold(relative(this.cwd, file)))
        }
        const newValue = `${oldValue}${this.ext}`
        this.log.debug(' ', oldValue, '->', newValue)
        Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
        modified = true
      }
    }
    if (modified) {
      this.patched[file] = astring.generate(ast)
      if (!this.dryRun) {
        writeFileSync(file, this.patched[file], 'utf8')
      }
    }
    return this.patched
  }
}

export class MTSPatcher extends ESMPatcher {

  patch ({
    file    = Error.required('file'),
    source  = readFileSync(resolve(this.cwd, file), 'utf8'),
    parsed  = recast.parse(source, { parser: recastTS }),
    index   = 0,
    total   = 0,
  }) {
    file = resolve(this.cwd, file)
    let modified = false
    for (const declaration of parsed.program.body) {
      if (!MTSPatcher.declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
      const oldValue = declaration.source.value
      const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
      const isNotPatched = !oldValue.endsWith(this.ext)
      if (isRelative && isNotPatched) {
        if (!modified) {
          this.log.log(`(${index}/${total})`, 'Patching', bold(relative(this.cwd, file)))
        }
        const newValue = `${oldValue}.dist`
        this.log.debug(' ', oldValue, '->', newValue)
        Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
        modified = true
      }
    }
    if (modified) {
      this.patched[file] = recast.print(parsed).code
      if (!this.dryRun) {
        writeFileSync(file, this.patched[file], 'utf8')
      }
    }
    return this.patched
  }

}

export class CJSPatcher extends Patcher {

  patch ({
    file    = Error.required('file'),
    source  = readFileSync(resolve(this.cwd, file), 'utf8'),
    ast     = acornParse(file, source),
    index   = 0,
    total   = 0,
  }) {
    const { cwd, log, ext } = this
    file = resolve(cwd, file)
    let modified = false
    acornWalk.simple(ast, {
      CallExpression (node) {
        //@ts-ignore
        const { callee: { type, name }, loc: { start: { line, column } } } = node
        const args = node['arguments']
        if (
          type === 'Identifier' &&
          name === 'require' // GOTCHA: if "require" is renamed to something else, idk
        ) {
          if (args.length === 1 && args[0].type === 'Literal') {
            const value = args[0].value
            if (value.startsWith('./') || value.startsWith('../')) {
              const target = `${resolve(dirname(file), value)}.ts`
              if (existsSync(target)) {
                if (!modified) {
                  log.log(`(${index}/${total})`, 'Patching', bold(relative(cwd, file)))
                }
                const newValue = `${value}${ext}`
                log.debug(`  require("${value}") -> require("${newValue}")`)
                args[0].value = newValue
                args[0].raw = JSON.stringify(newValue)
                modified = true
              } else {
                log.warn(`  require("${bold(value)}"): ${bold(target)} not found, ignoring`)
              }
            }
          } else {
            log.warn(
              `Dynamic or non-standard require() call encountered at ${file}:${line}:${column}. `+
              `\n\n${recast.print(node).code}\n\n`+
              `This library only patches calls of the format "require('./my-module')".'\n` +
              `File an issue at https://github.com/hackbg/ubik if you need to patch ` +
              `more complex require calls.`
            )
          }
        }

      }
    })
    if (modified) {
      this.patched[file] = astring.generate(ast)
      if (!this.dryRun) {
        writeFileSync(file, this.patched[file], 'utf8')
      }
    }
    return this.patched
  }

}

export class CTSPatcher extends Patcher {

  patch (args) {
    throw new Error('unimplemented')
    return this.patched
  }

}
