import Logged, { bold } from './Logged.mjs'
import Error from './Error.mjs'
import { acornParse } from './parse.mjs'

import { resolve, dirname, relative } from 'node:path'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import recast from 'recast'
import * as acornWalk from 'acorn-walk'
import * as astring from 'astring'
import { recastTS } from '../shims.cjs'

export default class Patcher extends Logged {

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
  
  savePatched (modified, file, src) {
    if (modified) {
      this.patched[file] = src
      if (!this.dryRun) {
        writeFileSync(file, this.patched[file], 'utf8')
      }
    }
    return this.patched
  }

  static esmDeclarationsToPatch = [
    'ImportDeclaration',
    'ExportDeclaration',
    'ImportAllDeclaration',
    'ExportAllDeclaration',
    'ExportNamedDeclaration'
  ]

  static MJS = class MJSPatcher extends Patcher {
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
        if (!Patcher.esmDeclarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
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
      return this.savePatched(modified, file, astring.generate(ast))
    }
  }

  static MTS = class MTSPatcher extends Patcher {
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
        if (!Patcher.esmDeclarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
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
      return this.savePatched(modified, file, recast.print(parsed).code)
    }
  }

  static CJS = class CJSPatcher extends Patcher {
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
      return this.savePatched(modified, file, astring.generate(ast))
    }
  }

  static CTS = class CTSPatcher extends Patcher {
    patch (args) {
      throw new Error('unimplemented')
      return this.patched
    }
  }

}
