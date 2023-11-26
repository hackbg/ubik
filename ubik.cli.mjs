#!/usr/bin/env node
/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import { resolve, relative, dirname } from 'node:path'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import fastGlob from 'fast-glob'
import { console, bold } from './package.mjs'
import * as Ubik from './ubik.mjs'

const argv = [...process.argv]
let interpreter = argv.shift()
let entrypoint = argv.shift()
// Dry run flag:
let dryRun = false
setDryRun() // works before command
let command = argv.shift()
setDryRun() // works after command
function setDryRun () {
  if (argv[0] === '--dry') {
    if (dryRun === false) {
      console.info('This is a dry run. No files will be modified.')
    }
    dryRun = true
    argv.shift()
  }
}

try {
  process.exit(await dispatch(command))
} catch (e) {
  console.br().error(e) 
  if (e.message) {
    console.br().error(`Ubik failed for the following reason:\n${bold(e.message)}`).br()
  }
  process.exit(2)
}

console.br()
console.log('Done.')
process.exit(0)

// Command dispatch:
async function dispatch (command) {
  switch (command) {
    case '--help': {
      Ubik.printHelp()
      return 1
    }
    case 'split-types': {
      if (argv.length === 0) {
        console.error('You did not provide any input directories (try "." or "./src").')
        return 1
      }
      const resolver = new Ubik.Resolver()
      resolver.load(argv).patch().save(dryRun)
      return 0
    }
    case 'split-stars': {
      if (argv.length === 0) {
        console.error('You did not provide any arguments.')
        return 1
      }
      const split = argv.indexOf('--')
      if (split === -1) {
        console.error('The command line did not contain the "--" separator.')
        return 1
      }
      const pkgs = argv.slice(0, split)
      if (pkgs.length < 1) {
        console.error('You did not provide any packages.')
        return 1
      }
      const srcs = argv.slice(split + 1)
      if (srcs.length < 1) {
        console.error('You did not provide any sources to process.')
        return 1
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
          Ubik.separateNamespaceImport({ path, packageName, dryRun })
        }
      }
      return 0
    }
    case 'fix-import-dirs': {
      if (argv.length === 0) {
        console.error('You did not provide any input directories.')
        return 1
      }
      const resolver = new Ubik.Resolver().load(argv)
      Ubik.Dirs.fixImportDirs(resolver, dryRun)
      return 0
    }
    case 'merge-package': {
      if (argv.length === 0) {
        Ubik.Merge.printUsageOfMerge()
        console.error('You did not provide any inputs.')
        return 1
      }
      const split = argv.indexOf('--')
      if (split === -1) {
        Ubik.Merge.printUsageOfMerge()
        console.error('The command line did not contain the "--" separator.')
        return 1
      }
      const pkgs = argv.slice(0, split)
      const dirs = argv.slice(split + 1)
      if (dirs.length < 1) {
        Ubik.Merge.printUsageOfMerge()
        console.error('You did not provide any packages to merge.')
        return 1
      }
      if (dirs.length < 1) {
        Ubik.Merge.printUsageOfMerge()
        console.error('You did not provide any sources to process.')
        return 1
      }
      const resolver = new Ubik.Resolver().load(dirs).load(pkgs)
      Ubik.Merge.redirectToRelative(resolver, pkgs, dryRun)
      return 0
    }
    case 'make-import-map': {
      Ubik.ImportMap.generateImportMap()
      return 0
    }
    case 'compile': {
      await new Ubik.TSCompiler(process.cwd(), { dryRun, keep: true }).compileAndPatch()
      return 0
    }
    case 'release': {
      await new Ubik.Publisher(process.cwd(), { dryRun, args: argv }).releasePackage()
      return 0
    }
    default: {
      Ubik.printUsage()
      if (command) {
        console.error(bold(command), 'is not a supported command. Try one of above.')
      }
      return 1
    }
  }
  return 0
}
