/**

  Ubik: Compile TypeScript and patch extensions
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

import { resolve, basename, dirname, relative, join, isAbsolute } from 'node:path'
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { exec, execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'
import { promisify } from 'node:util'

import { rimraf } from 'rimraf'
import { mkdirpSync } from 'mkdirp'
import recast from 'recast'
import * as acorn from 'acorn'
import * as acornWalk from 'acorn-walk'
import * as astring from 'astring'
import fastGlob from 'fast-glob'

import { recastTS } from '../shims.cjs'
import { UbikError } from '../tool/error.mjs'
import { console, bold } from '../tool/logger.mjs'
import { readPackageJson } from '../tool/packager.mjs'

const execPromise = promisify(exec)

if (process.env.UBIK_VERBOSE) console.warn(`Remembering the Node16/TS4 ESM crisis of April 2022...`)

const distDtsExt = '.dist.d.ts'
const distEsmExt = '.dist.mjs'
const distCjsExt = '.dist.cjs'
const distJsExt  = '.dist.js'
const distExts   = [distDtsExt, distEsmExt, distCjsExt, distJsExt]
const declarationsToPatch = [
  'ImportDeclaration',
  'ExportDeclaration',
  'ImportAllDeclaration',
  'ExportAllDeclaration',
  'ExportNamedDeclaration'
]

export async function prepareTypeScript ({
  cwd,
  packageJson = readPackageJson({ cwd }).packageJson,
  args = [],
  dtsOut = 'dist/dts',
  esmOut = 'dist/esm',
  cjsOut = 'dist/cjs',
  keep = false,
  dryRun = true,
} = {}) {
  packageJson.ubik = true
  await compileTypeScript({ cwd, dtsOut, esmOut, cjsOut })
  let distFiles = new Set()
  try {
    distFiles = await flattenFiles({ cwd, packageJson, dtsOut, esmOut, cjsOut })
    await patchPackageJson({ cwd, packageJson })
    await patchESMImports({ cwd, dryRun, files: packageJson.files })
    await patchDTSImports({ cwd, dryRun, files: packageJson.files })
    await patchCJSRequires({ cwd, dryRun, files: packageJson.files })
    if (dryRun) {
      console.info("Published package.json would be:")
      console.info(JSON.stringify(packageJson, null, 2))
    } else {
      console.log("Backing up package.json to package.json.bak")
      copyFileSync(join(cwd, 'package.json'), join(cwd, 'package.json.bak'))
      writeFileSync(join(cwd, 'package.json'), JSON.stringify(packageJson, null, 2), 'utf8')
    }
  } catch (e) {
    revertModifications({ cwd, keep: false, distFiles })
    throw e
  }
  return distFiles
}

/** Remove output files */
export function cleanFiles () {
  const { log, warn } = console.sub('(cleanup)')
  return Promise.all(distExts.map(ext=>
    fastGlob([
      '!node_modules',
      '!**/node_modules',
      `${cwd}/*${ext}`,
      `${cwd}/**/*${ext}`
    ]).then(names=>
      Promise.all(names.map(name=>
        new Promise(resolve=>rimraf(name, resolve))
          .then(()=>log('Deleted', name))
          .catch(()=>warn(`Failed to delete`, name)))))))
}

/** Remove output */
export async function cleanAll ({
  cwd
}) {
  cleanDirs()
  await cleanFiles()
  if (existsSync(join(cwd, 'package.json.bak'))) {
    console.log('Restoring package.json from package.json.bak')
    unlinkSync(join(cwd, 'package.json'))
    copyFileSync(join(cwd, 'package.json.bak'), join(cwd, 'package.json'))
    unlinkSync(join(cwd, 'package.json.bak'))
  }
}

/** Restore the original package.json and remove the dist files */
export function revertModifications ({
  cwd,
  keep = false,
  distFiles = new Set(),
  dtsOut = 'dist/dts',
  esmOut = 'dist/esm',
  cjsOut = 'dist/cjs',
} = {}) {

  if (keep) {
    console
      .warn("Not restoring original 'package.json'; keeping build artifacts.")
      .warn(
        "Your package is now in a *modified* state: make sure you don't commit it by accident!"
      )
      .warn(
        "When you're done inspecting the intermediate results, " +
        "rename 'package.json.bak' back to 'package.json'"
      )
    return true
  }

  console.log('Reverting modifications...')

  if (!existsSync(join(cwd, 'package.json.bak'))) {
    console.warn("Backup file package.json.bak not found")
  } else {
    console.log("Restoring original package.json")
    unlinkSync(join(cwd, 'package.json'))
    copyFileSync(join(cwd, 'package.json.bak'), join(cwd, 'package.json'))
    unlinkSync(join(cwd, 'package.json.bak'))
  }

  console.log('Deleting generated files...')
  ;[dtsOut, esmOut, cjsOut].map(out=>rimraf.sync(out))
  for (const file of distFiles) unlinkSync(file)

  return true

}

// Compile TS -> JS
export async function compileTypeScript ({
  cwd,
  tsc     = process.env.TSC || 'tsc',
  dtsOut  = 'dist/dts',
  esmOut  = 'dist/esm',
  cjsOut  = 'dist/cjs',
  verbose = process.env.UBIK_VERBOSE,
  esmModule = process.env.UBIK_ESM_MODULE || 'esnext',
  esmTarget = process.env.UBIK_ESM_TARGET || 'esnext',
  cjsModule = process.env.UBIK_CJS_MODULE || 'commonjs',
  cjsTarget = process.env.UBIK_CJS_TARGET || 'es6',
} = {}) {
  if (verbose) console.log('Compiling TypeScript...')
  return await runConcurrently({ cwd, commands: [
    // TS -> ESM
    `${tsc} --outDir ${esmOut} --target ${esmTarget} --module ${esmModule} --declaration --declarationDir ${dtsOut}`,
    // TS -> CJS
    `${tsc} --outDir ${cjsOut} --target ${cjsTarget} --module ${cjsModule}`
  ]})
}

export async function flattenFiles ({
  cwd,
  packageJson,
  dtsOut = 'dist/dts',
  esmOut = 'dist/esm',
  cjsOut = 'dist/cjs',
}) {
  // Files given new locations by the flattening.
  // Deleted after publication - unless you run `ubik fix`, which keeps them around.
  const distFiles = new Set()

  // Collect output in package root and add it to "files" in package.json:
  console.log('Flattening package...')
  const files = [

    ...await collectFiles({
      cwd,
      distFiles,
      name: 'ESM',
      srcDir: dirname(packageJson.main),
      distDir: esmOut,
      ext1: '.js',
      ext2: distEsmExt,
    }),

    ...await collectFiles({
      cwd,
      distFiles,
      name: 'CJS',
      srcDir: dirname(packageJson.main),
      distDir: cjsOut,
      ext1: '.js',
      ext2: distCjsExt,
    }),

    ...await collectFiles({
      cwd,
      distFiles,
      name: 'DTS',
      srcDir: dirname(packageJson.main),
      distDir: dtsOut,
      ext1: '.d.ts',
      ext2: distDtsExt,
    }),

  ]

  packageJson.files = [...new Set([...packageJson.files||[], ...files])].sort()

  console.log('Removing dist directories...')
  ;[dtsOut, esmOut, cjsOut].map(out=>rimraf.sync(out))

  return distFiles
}

// Changes x.a to x.b:
const replaceExtension = (x, a, b) => join(dirname(x), `${basename(x, a)}${b}`)

export async function collectFiles ({
  cwd,
  name,
  srcDir,
  distDir,
  ext1,
  ext2,
  distFiles = new Set(),
} = {}) {
  const { log } = console.sub(`(collecting ${name})`)
  log(`Collecting from`, bold(`${distDir}/**/*${ext1}`), 'into', bold(`./**/*${ext2}"`))
  const inputs = await fastGlob([
    '!node_modules',
    '!**/node_modules',
    `${distDir}/*${ext1}`,
    `${distDir}/**/*${ext1}`
  ])
  const outputs = []
  for (const file of inputs) {
    if (!file.endsWith(ext1)) continue
    const srcFile = join(cwd, file)
    const newFile = replaceExtension(join(srcDir, relative(distDir, file)), ext1, ext2)
    mkdirpSync(dirname(newFile))
    log(`  ${toRel(cwd, srcFile)} -> ${toRel(cwd, newFile)}`)
    copyFileSync(srcFile, newFile)
    unlinkSync(srcFile)
    outputs.push(newFile)
    distFiles.add(newFile)
  }
  return outputs
}

export function patchPackageJson ({
  cwd,
  packageJson,
  forceTS = process.env.UBIK_FORCE_TS
}) {
  const main        = join(cwd, packageJson.main    || 'index.ts')
  const browserMain = join(cwd, packageJson.browser || 'index.browser.ts') // TODO
  // Set "main", "types", and "exports" in package.json.
  const esmMain = replaceExtension(main, '.ts', distEsmExt)
  const cjsMain = replaceExtension(main, '.ts', distCjsExt)
  const dtsMain = replaceExtension(main, '.ts', distDtsExt)
  packageJson.types = toRel(cwd, dtsMain)
  packageJson.exports ??= {}
  if (forceTS && packageJson.main.endsWith('.js')) {
    console.error(
      `${bold('UBIK_FORCE_TS')} is on, but "main" has "js" extension.`,
      bold('Make "main" point to the TS index')
    )
    throw new UbikError.WrongMainExtension()
  }
  if (packageJson.type === 'module') {
    packageJson.main = toRel(cwd, esmMain)
    packageJson.exports["."] = {
      "source":  toRel(cwd, main),
      "require": toRel(cwd, cjsMain),
      "default": toRel(cwd, esmMain)
    }
  } else {
    packageJson.main = toRel(cwd, esmMain)
    packageJson.exports["."] = {
      "source":  toRel(cwd, main),
      "import":  toRel(cwd, esmMain),
      "default": toRel(cwd, cjsMain)
    }
  }
  return packageJson
}

export function patchESMImports ({
  files = [],
  dryRun = true,
  verbose = process.env.UBIK_VERBOSE,
  ecmaVersion = process.env.UBIK_ECMA || 'latest'
}) {
  files = files.filter(x=>x.endsWith(distEsmExt))
  console.log()
  console.log(`Patching imports in ${files.length} ESM files...`)
  const patched = {}
  for (const file of files) {
    const src = readFileSync(file, 'utf8')
    const ast = acorn.parse(src, { ecmaVersion, sourceType: 'module' })

    let modified = false
    for (const declaration of ast.body) {
      if (!declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
      const oldValue = declaration.source.value
      const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
      const isNotPatched = !oldValue.endsWith(distEsmExt)
      if (isRelative && isNotPatched) {
        if (!modified) {
          console.log()
          console.log('Patching', bold(file))
        }
        const newValue = `${oldValue}${distEsmExt}`
        console.log(' ', oldValue, '->', newValue)
        Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
        modified = true
      }
    }

    if (modified) {
      patched[file] = astring.generate(ast)
      if (!dryRun) {
        writeFileSync(file, patched[file], 'utf8')
      }
    }
  }
  return patched
}

export function patchDTSImports ({
  files,
  verbose = process.env.UBIK_VERBOSE,
  dryRun = true,
}) {
  files = files.filter(x=>x.endsWith(distDtsExt))
  console.log()
  console.log(`Patching imports in ${files.length} DTS files...`)
  const patched = {}
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    const parsed = recast.parse(source, { parser: recastTS })

    let modified = false
    for (const declaration of parsed.program.body) {
      if (!declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
      const oldValue = declaration.source.value
      const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
      const isNotPatched = !oldValue.endsWith(distDtsExt)
      if (isRelative && isNotPatched) {
        if (!modified) {
          console.log()
          console.log('Patching', bold(file))
        }
        const newValue = `${oldValue}.dist`
        console.log(' ', oldValue, '->', newValue)
        Object.assign(declaration.source, { value: newValue, raw: JSON.stringify(newValue) })
        modified = true
      }
    }

    if (modified) {
      patched[file] = recast.print(parsed).code
      if (!dryRun) {
        writeFileSync(file, patched[file], 'utf8')
      }
    }
  }
  return patched
}

export function patchCJSRequires ({
  cwd,
  files = [],
  verbose = process.env.UBIK_VERBOSE,
  dryRun = true,
}) {
  files = files.filter(x=>x.endsWith(distCjsExt))
  console.log(`Patching requires in ${files.length} CJS files...`)
  const patched = {}
  for (const file of files) {
    const ast = acorn.parse(readFileSync(file, 'utf8'), {
      ecmaVersion: process.env.UBIK_ECMA||'latest',
      sourceType: 'module',
      locations:  true
    })

    let modified = false

    acornWalk.simple(ast, {
      CallExpression (node) {
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
                  console.log()
                  console.log('Patching', bold(file))
                }
                const newValue = `${value}${distCjsExt}`
                console.log(`  require("${value}") -> require("${newValue}")`)
                args[0].value = newValue
                args[0].raw = JSON.stringify(newValue)
                modified = true
              } else {
                console.warn(`  require("${value}"): ${relative(cwd, target)} not found, ignoring`)
              }
            }
          } else {
            console.warn(
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
      patched[file] = astring.generate(ast)
      if (!dryRun) {
        writeFileSync(file, patched[file], 'utf8')
      }
    }
  }
  return patched
}

export async function runConcurrently ({
  cwd,
  commands = [],
  verbose  = process.env.UBIK_VERBOSE
}) {

  console.log(`Running ${bold(commands.length)} commands in ${bold(cwd)}:`)
  commands.forEach(command=>console.log(' ', command))

  try {
    return await Promise.all(commands.map(
      command=>execPromise(command, { cwd, stdio: 'inherit' })
    ))
  } catch (e) {
    process.stdout.write(e.stdout)
    throw new UbikError.RunFailed(commands)
  }

}

// Convert absolute path to relative
export function toRel (cwd, path) {
  return `./${isAbsolute(path)?relative(cwd, path):path}`
}
