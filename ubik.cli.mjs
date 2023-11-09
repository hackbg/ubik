#!/usr/bin/env node
//@ts-check

/**

  Ubik
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

import { resolve, relative, dirname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import fastGlob from 'fast-glob'

import { Console, bold, colors } from '@hackbg/logs'

import redirectToRelative, { printUsageOfMerge } from './task/merge.mjs'
import fixImportDirs from './task/dirs.mjs'
import { release } from './task/publish.mjs'
import { prepareTypeScript } from './task/compile.mjs'
import { generateImportMap } from './task/importmap.mjs'
import { separateNamespaceImport } from './task/stars.mjs'

import { Resolver } from './tool/resolver.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ownPackage = resolve(__dirname, 'package.json')
const { version } = JSON.parse(readFileSync(ownPackage, 'utf8'))
const console = new Console(`@hackbg/ubik ${version}`)

const argv = [...process.argv]
let interpreter = argv.shift()
let entrypoint = argv.shift()

// Dry run flag:
let dryRun = false
setDryRun() // before command
let command = argv.shift()
setDryRun() // after command

try {
  // Command dispatch:
  switch (command) {

    case 'rationale':
      printRationale()
      process.exit(1)
      break

    case 'split-types': {
      if (argv.length === 0) {
        console.error('You did not provide any input directories (try "." or "./src").')
        process.exit(1)
      }
      const resolver = new Resolver()
      resolver.load(argv).patch().save(dryRun)
      break
    }

    case 'split-stars': {
      if (argv.length === 0) {
        console.error('You did not provide any arguments.')
        process.exit(1)
      }
      const split = argv.indexOf('--')
      if (split === -1) {
        console.error('The command line did not contain the "--" separator.')
        process.exit(1)
      }
      const pkgs = argv.slice(0, split)
      if (pkgs.length < 1) {
        console.error('You did not provide any packages.')
        process.exit(1)
      }
      const srcs = argv.slice(split + 1)
      if (srcs.length < 1) {
        console.error('You did not provide any sources to process.')
        process.exit(1)
      }
      const targets = new Set()
      for (const target of srcs) {
        const stats = statSync(target)
        if (stats.isFile()) {
          targets.add(target)
        } else if (stats.isDirectory()) {
          for (const file of await fastGlob(resolve(target, '**', '*.ts'))) {
            targets.add(relative(process.cwd(), file))
          }
        } else {
          throw new Error(`${target} is neither file nor directory`)
        }
      }
      console.log('Patching:')
      for (const target of targets) {
        console.log(' -', target)
      }
      console.log(`Patching ${targets.size} files.`)
      for (const path of targets) {
        console.br()
        console.log('Patching', bold(path))
        for (const packageName of pkgs) {
          separateNamespaceImport({ path, packageName, dryRun })
        }
      }
      break
    }

    case 'fix-import-dirs': {
      if (argv.length === 0) {
        console.error('You did not provide any input directories.')
        process.exit(1)
      }
      const resolver = new Resolver().load(argv)
      fixImportDirs(resolver, dryRun)
      break
    }

    case 'merge-package': {
      if (argv.length === 0) {
        printUsageOfMerge()
        console.error('You did not provide any inputs.')
        process.exit(1)
      }
      const split = argv.indexOf('--')
      if (split === -1) {
        printUsageOfMerge()
        console.error('The command line did not contain the "--" separator.')
        process.exit(1)
      }
      const pkgs = argv.slice(0, split)
      const dirs = argv.slice(split + 1)
      if (dirs.length < 1) {
        printUsageOfMerge()
        console.error('You did not provide any packages to merge.')
        process.exit(1)
      }
      if (dirs.length < 1) {
        printUsageOfMerge()
        console.error('You did not provide any sources to process.')
        process.exit(1)
      }
      const resolver = new Resolver().load(dirs).load(pkgs)
      redirectToRelative(resolver, pkgs, dryRun)
      break
    }

    case 'make-import-map': {
      generateImportMap()
      break
    }

    case 'compile': {
      await prepareTypeScript({ dryRun, cwd: process.cwd(), keep: true })
      break
    }

    case 'publish': {
      await release({ dryRun, cwd: process.cwd(), args: argv })
      break
    }

    default:
      printUsage()
      if (command) {
        console.error(bold(command), 'is not a supported command. Try one of above.')
      }
      process.exit(1)
      break

  }
} catch (e) {
  console.error(e) 
  if (e.message) {
    console.error(`Ubik failed for the following reason:\n${bold(e.message)}`)
  }
  process.exit(2)
}

console.br()
console.log('Done.')
process.exit(0)

function printUsage () {
  console.info('Welcome to', bold(`@hackbg/ubik ${version}`))
  console.info()
  console.info('Supported operations:')
  console.info()
  console.info(' ', bold('rationale'))
  console.info('     Provide more detailed descriptions of what each command does and why.')
  console.info(' ', bold('split-types'), '[--dry] [subdirs...]')
  console.info(`     ${colors.yellow('Experimental.')} Fix types imported without "import type"`)
  console.info(' ', bold('split-stars'), '[--dry] packagenames... -- sourcedirs...')
  console.info(`     ${colors.yellow('Experimental.')} Fix default imports of CommonJS modules imported as ESM by Node`)
  console.info(' ', bold('fix-import-dirs'), '[--dry] [subdirs...]')
  console.info(`     ${colors.yellow('Experimental.')} Add missing directory indices`)
  console.info(' ', bold('merge-package'), '[--dry] packages... -- sources...')
  console.info(`     ${colors.yellow('Experimental.')} Merge another package into this one`)
  console.info(' ', bold('make-import-map'), '[--dry] [subdirs...]')
  console.info(`     ${colors.yellow('Experimental.')} Generate importmap.json from node_modules`)
  console.info(' ', bold('compile'), '[--dry]')
  console.info(`     ${colors.green('Stable.')} Compile package to ESM only, fixing the missing extensions.`)
  console.info(' ', bold('publish'), '[--dry] [--compile|--compile-dual]')
  console.info(`     ${colors.green('Stable.')} Publish this package to NPM and push a version tag.`)
  console.info()
  console.info(`The ${bold(`--dry`)} flag performs a "dry run": it performs all the code mods`)
  console.info(`but does not write the results to disk.`)
}

function printRationale () {
  console.info('Welcome to', bold(`@hackbg/ubik ${version}`), ';-)')
  console.info()
  console.info('Supported operations:')
  console.info()
  console.info(' ', bold('split-types'), '[--dry] [subdirs...]')
  console.info()
  console.info('     Some TS packages use "import" indiscriminately for values *and* types.')
  console.info('     They rely on the bundler to ultimately tell apart the two and strip the')
  console.info('     types before execution.')
  console.info()
  console.info('     But in case you just want to compile the TS to JS, you will find that')
  console.info('     the type imports show in the compiled code as missing value imports,')
  console.info('     and the runtime will throw a SyntaxError.')
  console.info()
  console.info('     This command visits every TypeScript file in your project (or just from')
  console.info('     the specified', bold('subdirs')+'), identifies which specifiers in the')
  console.info('     "import" or "export ... from" are actually types, and puts those in')
  console.info('     separate "import type" or "export type ... from" declarations.')
  console.info('     This way, TypeScript strips them at compile time and your code can run.')
  console.info()
  console.info(' ', bold('split-stars'), '[--dry] packagenames... -- sourcedirs...')
  console.info()
  console.info('     In Node.js, when a ESM package imports a CommonJS package using "import *"')
  console.info('     an extra "default" key may be added around the imported package contents.')
  console.info('     TypeScript doesn\'t know about this, and just gets confused. This command')
  console.info('     changes the import statement to add a destructuring assignment, and updates')
  console.info('     the type namespace so both Node and TypeScript can find their stuff.')
  console.info()
  console.info(' ', bold('fix-import-dirs'), '[--dry] [subdirs...]')
  console.info()
  console.info(`     Some packages use directory imports, i.e. 'import "./path/to/directory" is`)
  console.info(`     assumed to mean 'import "./path/to/directory/index". This is non-standard`)
  console.info(`     behavior, specific to the Node.js runtime in CommonJS mode.`)
  console.info()
  console.info(`     Again, bundlers usually paper over the issue. What's even better`)
  console.info(`     is having valid code in the first place. This command detects when`)
  console.info(`     an import or reexport points to a directory, and changes it to point`)
  console.info(`     to "index.ts" within that directory.`)
  console.info()
  console.info(`     It also warns you if both "./foo/bar.ts" and "./foo/bar/index.ts" exist,`)
  console.info(`     which is ambiguous; Ubik resolves it in favor of the first one.`)
  console.info()
  console.info(' ', bold('make-import-map'))
  console.info()
  console.info(`     Import maps exist and are well supported by browsers. But we've been`)
  console.info(`     unable to find a tool that reliably generates one, much less a tool that`)
  console.info(`     applies patches and shims for packages that do not yet publish natively`)
  console.info(`     ESM-compatible builds. This command does the former, and will eventually`)
  console.info(`     expose hooks for defining the latter.`)
  console.info()
  console.info(' ', bold('merge-package'), '[--dry] packages... -- sources...')
  console.info()
  console.info('     With workspace support in package managers becoming mainstream,')
  console.info('     splitting your code across multiple NPM packages becomes handy -')
  console.info('     especially if you want to let people not download dependencies for')
  console.info('     parts of your project that they are not using.')
  console.info()
  console.info('     However, in some cases splitting a project into subpackages')
  console.info('     may be premature: more packages means more NPM records that you')
  console.info('     need to keep up to date.')
  console.info()
  console.info('     Worry not! This command lets you merge another package into the')
  console.info('     current one, replacing imports/reexports with the corresponding')
  console.info('     relative paths.')
  console.info()
  console.info(' ', bold('compile'), '[--dry]')
  console.info()
  console.info('     The original Ubik fix for TypeScript\'s dirty little secret.')
  console.info()
  console.info('     First of all, this command compiles your TypeScript package')
  console.info('     into both ESM and CJS formats. This allows you to maintain backwards')
  console.info('     compatibility with CommonJS and synchronous imports. Nifty!')
  console.info()
  console.info('     What\'s more, TS nudges you to use ESM import syntax (ever seen a')
  console.info('     "require type"? there isn\'t one - and mixing "require" with ')
  console.info('     "import type" is weird) but at the same time the ESM code that ')
  console.info('     TS outputs is plain invalid: while TS disallows extensions in "import",')
  console.info('     the ES Module Specification *requires* them. TS does nothing about that,')
  console.info('     just happily emits invalid modules.')
  console.info()
  console.info('     Once again, the unwritten assumption is that you are expected to')
  console.info('     "just" depend on a bundler to finish TypeScript\'s work. Instead of')
  console.info('     complaining on GitHub and letting the maintainers tell you that you')
  console.info('     are complaining wrong, run this command. It will compile your code,')
  console.info('     then add the missing extensions like it\'s noone\'s business.')
  console.info()
  console.info(' ', bold('publish'), '[--dry] [--compile|--compile-dual]')
  console.info()
  console.info('     Publishing a package should not take more than one step.')
  console.info()
  console.info('     This command publishes the current package to NPM')
  console.info('     (optionally compiling to ESM+DTS or ESM+CJS+DTS),')
  console.info('     tags the current commit with "@npm/$PACKAGE/$VERSION",')
  console.info('     and pushes the tag to upstream (but not the branch).')
  console.info()
  console.info('     Publishing fails fast if there already exists a published')
  console.info('     version with the current version number.')
  console.info()
}

function setDryRun () {
  if (argv[0] === '--dry') {
    if (dryRun === false) {
      console.info('This is a dry run. No files will be modified.')
    }
    dryRun = true
    argv.shift()
  }
}
