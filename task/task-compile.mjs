/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, basename, dirname, relative, join, isAbsolute } from 'node:path'
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { exec, execSync, execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

import { rimraf } from 'rimraf'
import { mkdirpSync } from 'mkdirp'
import recast from 'recast'
import * as acorn from 'acorn'
import * as acornWalk from 'acorn-walk'
import * as astring from 'astring'
import fastGlob from 'fast-glob'

import { recastTS } from '../shims.cjs'
import { required, Console, bold, Package, runConcurrently } from '../tool/tool.mjs'

const console = new Console('@hackbg/ubik (compile)')

if (process.env.UBIK_VERBOSE) console.warn(`Remembering the Node16/TS4 ESM crisis of April 2022...`)

export const distDtsExt = '.dist.d.ts'
export const distEsmExt = '.dist.mjs'
export const distCjsExt = '.dist.cjs'
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
  cwd     = process.cwd(),
  pkgJson = Package.readPackageJson({ cwd }).pkgJson,
  args    = [],
  dtsOut  = 'dist/dts',
  esmOut  = 'dist/esm',
  cjsOut  =  'dist/cjs',
  keep    = false,
  dryRun  = true,
} = {}) {
  pkgJson.ubik = true
  await compileTypeScript({ cwd, dtsOut, esmOut, cjsOut })
  await runConcurrently({ cwd, commands: [ 'ls -al' ] })
  let distFiles = new Set()
  const onError = source => e => {
    console.br().error(`${bold(source)} failed:`, bold(e.message))
    revertModifications({ cwd, keep: false, distFiles })
    throw e
  }
  distFiles = await flattenFiles({ cwd, pkgJson, dtsOut, esmOut, cjsOut })
    .catch(onError('flattenFiles'))
  try {
    Package.patchPackageJson({ cwd, pkgJson, distDtsExt, distEsmExt, distCjsExt })
  } catch (e) {
    onError('patchPackageJson')(e)
  }
  try {
    patchAll(distEsmExt, patchESMImport, { cwd, dryRun, files: pkgJson.files })
  } catch (e) {
    onError('patchESMImports')(e)
  }
  try {
    patchAll(distDtsExt, patchDTSImport, { dryRun, files: pkgJson.files })
  } catch (e) {
    onError('patchDTSImports')(e)
  }
  try {
    patchAll(distCjsExt, patchCJSRequire, { cwd, dryRun, files: pkgJson.files })
  } catch (e) {
    onError('patchCJSRequires')(e)
  }
  if (dryRun) {
    console.br().info(`Published package.json would be:\n${JSON.stringify(pkgJson, null, 2)}`)
  } else {
    console.log("Backing up package.json to package.json.bak")
    copyFileSync(join(cwd, 'package.json'), join(cwd, 'package.json.bak'))
    writeFileSync(join(cwd, 'package.json'), JSON.stringify(pkgJson, null, 2), 'utf8')
  }
  return distFiles
}

/** Restore the original package.json and remove the dist files */
export function revertModifications ({
  cwd       = process.cwd(),
  keep      = false,
  distFiles = new Set(),
  dtsOut    = 'dist/dts',
  esmOut    = 'dist/esm',
  cjsOut    = 'dist/cjs',
} = {}) {

  if (keep) {
    console
      .br()
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

  console
    .br()
    .log('Reverting modifications...')

  if (!existsSync(join(cwd, 'package.json.bak'))) {
    console
      .br()
      .warn("Backup file package.json.bak not found")
  } else {
    console
      .br()
      .log("Restoring original package.json")
    unlinkSync(join(cwd, 'package.json'))
    copyFileSync(join(cwd, 'package.json.bak'), join(cwd, 'package.json'))
    unlinkSync(join(cwd, 'package.json.bak'))
  }

  console
    .br()
    .log('Deleting generated files...')
  ;[dtsOut, esmOut, cjsOut].map(out=>rimraf.sync(out))
  for (const file of distFiles) {
    unlinkSync(file)
  }

  return true

}

// Compile TS -> JS
export async function compileTypeScript ({
  cwd       = process.cwd(),
  tsc       = process.env.TSC || 'tsc',
  dtsOut    = 'dist/dts',
  esmOut    = 'dist/esm',
  cjsOut    = 'dist/cjs',
  verbose   = process.env.UBIK_VERBOSE,
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
  cwd     = process.cwd(),
  pkgJson = Package.readPackageJson({ cwd }).pkgJson,
  dtsOut  = 'dist/dts',
  esmOut  = 'dist/esm',
  cjsOut  = 'dist/cjs',
}) {
  // Files given new locations by the flattening.
  // Deleted after publication - unless you run `ubik fix`, which keeps them around.
  const distFiles = new Set()

  // Collect output in package root and add it to "files" in package.json:
  console.br().log('Flattening package...')
  await collectFiles({
    cwd, distFiles, name: 'ESM',
    srcDir: dirname(pkgJson.main), distDir: esmOut,
    ext1: '.js', ext2: distEsmExt,
  })
  await collectFiles({
    cwd, distFiles, name: 'CJS',
    srcDir: dirname(pkgJson.main), distDir: cjsOut,
    ext1: '.js', ext2: distCjsExt,
  })
  await collectFiles({
    cwd, distFiles, name: 'DTS',
    srcDir: dirname(pkgJson.main), distDir: dtsOut,
    ext1: '.d.ts', ext2: distDtsExt,
  })

  pkgJson.files = [...[...distFiles].sort(), ...pkgJson.files||[]]

  console
    .br()
    .log(`Collected files:\n  ${pkgJson.files.join('\n  ')}`)

  console
    .br()
    .debug('Removing dist directories...')

  ;[dtsOut, esmOut, cjsOut].map(out=>rimraf.sync(out))

  return distFiles
}

export async function collectFiles ({
  cwd       = process.cwd(),
  name      = required('name')    || '',
  srcDir    = required('srcDir')  || '',
  distDir   = required('distDir') || '',
  ext1      = required('ext1')    || '',
  ext2      = required('ext2')    || '',
  distFiles = new Set(),
} = {}) {
  console.br()
  const { debug: log } = console.sub(`collecting ${name}:`)
  log(`Collecting from`, bold(`${distDir}/**/*${ext1}`), 'into', bold(`./**/*${ext2}"`))
  const inputs = await fastGlob([
    '!node_modules',
    '!**/node_modules',
    `${distDir}/*${ext1}`,
    `${distDir}/**/*${ext1}`
  ])
  const outputs = []
  for (const file of inputs.filter(file=>file.endsWith(ext1))) {
    const srcFile = join(cwd, file)
    const newFile = Package.replaceExtension(
      join(srcDir, relative(distDir, file)), ext1, ext2
    )
    mkdirpSync(dirname(newFile))
    log(`  ${Package.toRel(cwd, srcFile)} -> ${Package.toRel(cwd, newFile)}`)
    copyFileSync(srcFile, newFile)
    unlinkSync(srcFile)
    outputs.push(newFile)
    distFiles.add(newFile)
  }
  return outputs
}

export function patchAll (ext, patch, {
  cwd         = process.cwd(),
  files       = [],
  dryRun      = true,
  verbose     = process.env.UBIK_VERBOSE,
  ecmaVersion = process.env.UBIK_ECMA || 'module'
}) {
  files = files.filter(x=>x.endsWith(ext))
  console.br().log(`Patching ${files.length} ${ext} files with ${patch.name}`)
  let patched = {}
  for (let i = 0; i < files.length; i++) {
    patched = patch({
      ecmaVersion, patched, cwd, dryRun,
      file: files[i], index: i+1, total: files.length
    })
  }
  return patched
}

export function patchESMImport ({
  patched     = {},
  cwd         = process.cwd(),
  dryRun      = true,
  file        = required('file'),
  source      = readFileSync(resolve(cwd, file), 'utf8'),
  ecmaVersion = process.env.UBIK_ECMA||'latest',
  ast         = acornParse(file, source),
  index = 0,
  total = 0,
}) {
  file = resolve(cwd, file)
  let modified = false
  //@ts-ignore
  const { body } = ast
  for (const declaration of body) {
    if (!declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
    const oldValue = declaration.source.value
    const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
    const isNotPatched = !oldValue.endsWith(distEsmExt)
    if (isRelative && isNotPatched) {
      if (!modified) {
        console.log(`(${index}/${total})`, 'Patching', bold(relative(cwd, file)))
      }
      const newValue = `${oldValue}${distEsmExt}`
      console.debug(' ', oldValue, '->', newValue)
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
  return patched
}

export function patchDTSImport ({
  patched = {},
  cwd     = process.cwd(),
  dryRun  = true,
  file    = required('file'),
  source  = readFileSync(resolve(cwd, file), 'utf8'),
  parsed  = recast.parse(source, { parser: recastTS }),
  ecmaVersion = process.env.UBIK_ECMA||'latest',
  index = 0,
  total = 0,
}) {
  file = resolve(cwd, file)
  let modified = false
  for (const declaration of parsed.program.body) {
    if (!declarationsToPatch.includes(declaration.type) || !declaration.source?.value) continue
    const oldValue = declaration.source.value
    const isRelative = oldValue.startsWith('./') || oldValue.startsWith('../')
    const isNotPatched = !oldValue.endsWith(distDtsExt)
    if (isRelative && isNotPatched) {
      if (!modified) {
        console.log(`(${index}/${total})`, 'Patching', bold(relative(cwd, file)))
      }
      const newValue = `${oldValue}.dist`
      console.debug(' ', oldValue, '->', newValue)
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
  return patched
}

export function patchCJSRequire ({
  patched     = {},
  cwd         = process.cwd(),
  dryRun      = true,
  file        = required('file'),
  source      = readFileSync(resolve(cwd, file), 'utf8'),
  ecmaVersion = process.env.UBIK_ECMA||'latest',
  ast         = acornParse(file, source),
  index = 0,
  total = 0,
}) {
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
                console.log(`(${index}/${total})`, 'Patching', bold(relative(cwd, file)))
              }
              const newValue = `${value}${distCjsExt}`
              console.debug(`  require("${value}") -> require("${newValue}")`)
              args[0].value = newValue
              args[0].raw = JSON.stringify(newValue)
              modified = true
            } else {
              console.warn(`  require("${bold(value)}"): ${bold(target)} not found, ignoring`)
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
  return patched
}

function acornParse (name, source) {
  const ecmaVersion = process.env.UBIK_ECMA||'latest'
  try {
    return acorn.parse(source, {
      sourceType: 'module',
      locations: true,
      //@ts-ignore
      ecmaVersion
    })
  } catch (e) {
    console.br()
      .error('Failed to parse', bold(name))
      .error(bold(e.message), 'at', e.loc.line, ':', e.loc.column)
      .error(`Source:\n${source}`)
  }
}
