#!/usr/bin/env node
/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */

globalThis.Error.stackTraceLimit = 100
import assert, { throws, equal, deepEqual, rejects } from 'node:assert'
import { fixture } from './.fixtures/fixtures.mjs'
import {
  Error,
  printUsage,
  printHelp,
  ImportMap,
  separateNamespaceImport,
  Resolver,
  Publisher,
  Package,
  fixImportDirs,
  printUsageOfMerge,
  markIfModified,
  getRelativeSpecifier,
  redirectToRelativePackageEntry,
  redirectToRelativePackage,
  redirectToRelative
} from './ubik.mjs'
import { TSFile } from './src/Resolver.mjs'
import { makeSureRunIsDry } from './src/Publisher.mjs'

throws(Error.required)

const mute = { info: () => mute }

printUsage(
  //@ts-ignore
  mute
)

printHelp(
  //@ts-ignore
  mute
)

await import('./src/Publisher.test.mjs')
await import('./src/Patcher.test.mjs')
await import('./src/Package.test.mjs')
await import('./src/run.test.mjs')

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { rimraf } from 'rimraf'

await ImportMap.fromPNPM({ write: false })

throws(()=>new Resolver('./test.mjs'))

{
  const resolver = new Resolver('./.fixtures')
  equal(resolver.load(), resolver)
  throws(()=>resolver.resolve('fixture1', './missing') instanceof TSFile)
  throws(()=>resolver.resolve('fixture1', './foo.ts'))
  assert(resolver.resolve('fixture1', './foo') instanceof TSFile)
  equal(resolver.resolve('fixture1', 'foo'), null)
  assert(resolver.resolve('fixture1', './subdir3') instanceof TSFile)
  assert(resolver.resolve('fixture1', './subdir1') instanceof TSFile)
  let file
  file = new TSFile(resolver, 'fixture0.ts', `
    import foo, { foo1, foo2 } from './foo'
    import type bar from './bar'
    import type { bar2, bar3 } from './bar'
    export const baz1 = 1, baz2 = 2
    export type Quux1 = string|number
    export interface Quux2 { foo: Quux1, bar: Quux2 }
    export * from './foo'
    export default from './foo'
    export { default as foo } from './foo'
    export { foo1, foo2 } from './foo'
    export type * from './bar'
    export type { default as bar } from './bar'
    export type { bar1, bar2 } from './bar'
  `)
  equal(file.patch(), file)
  equal(file.save(true), `
    import foo, { foo1, foo2 } from './foo'
    import type bar from './bar'
    import type { bar2, bar3 } from './bar'
    export const baz1 = 1, baz2 = 2
    export type Quux1 = string|number
    export interface Quux2 { foo: Quux1, bar: Quux2 }
    export * from './foo'
    export default from './foo'
    export { default as foo } from './foo'
    export { foo1, foo2 } from './foo'
    export type * from './bar'
    export type { default as bar } from './bar'
    export type { bar1, bar2 } from './bar'
  `)
  file = new TSFile(resolver, 'fixture0.ts', `export default from './foo'`)
  equal(file.patch(), file)
  equal(file.save(true), `export default from './foo'`)
  file = new TSFile(resolver, 'fixture0.ts', `export type { default as foo } from './foo'`)
  equal(file.patch(), file)
  equal(file.save(true), `export type { default as foo } from './foo'`)
  file = new TSFile(resolver, 'fixture0.ts', `export { default as foo } from './foo'`)
  equal(file.patch(), file)
  equal(file.save(true), `export { default as foo } from './foo'`)
  file = new TSFile(resolver, 'fixture0.ts', `import { default as foo } from 'package'`)
  equal(file.patch(), file)
  equal(file.save(true), `import { default as foo } from 'package'`)
  file = new TSFile(resolver, 'fixture0.ts', `import { foo } from './missing'`)
  throws(()=>file.patch())
  file = new TSFile(resolver, 'fixture0.ts', `import { Foo, Bar, Baz } from './mixed'`)
  equal(file.patch(), file)
  equal(file.save(true), [
    `import { Foo } from './mixed';`,
    `import type { Bar, Baz } from './mixed';`
  ].join('\n'))
  file = new TSFile(resolver, 'fixture0.ts', `import { Foo, Bar, Baz, Quux } from './mixed'`)
  throws(()=>file.patch())
  file = new TSFile(resolver, 'fixture0.ts', `import { Foo, Bar, Baz } from './subdir3'`)
  throws(()=>file.patch())
  file = new TSFile(resolver, 'fixture0.ts', `import { Foo, Bar, Baz } from './subdir1'`)
  equal(file.patch(), file)
  equal(file.save(true), [
    `import { Foo } from "./subdir1/index";`,
    `import type { Bar, Baz } from "./subdir1/index";`
  ].join('\n'))
  file = new TSFile(resolver, 'fixture0.ts', `export { Foo, Bar, Baz } from './subdir1'`)
  equal(file.patch(), file)
  equal(file.save(true), [
    `export { Foo } from "./subdir1/index";`,
    `export type { Bar, Baz } from "./subdir1/index";`
  ].join('\n'))
  const case1 = new Resolver('.fixtures/case1')
  case1.load(['.'])
  case1.patch().save(true)

  assert.equal(
    separateNamespaceImport({ path: fixture('stars.ts'), packageName: 'foobar' }),
    readFileSync(fixture('stars-fixed.ts'), 'utf8')
  )
}

{
  const resolver = new Resolver('.fixtures/merge').load(['api', 'lib', 'types'])
  fixImportDirs(resolver, true)
  printUsageOfMerge()
  markIfModified()
  getRelativeSpecifier({ resolver, entry: { path: '', parsed: '' }, path: '', prefix: '', specifier: '', })
  redirectToRelativePackageEntry({ resolver, entry: { path: '', parsed: '' }, name: '', path: '', prefix: '', })
  redirectToRelativePackage({ resolver, path: 'types', dry: true })
  redirectToRelative(resolver, [ 'types' ])
  const previousCwd = process.cwd()
  for (const cwd of [
    fixture('publish-esm'),
    fixture('publish-cjs')
  ]) {
    try {
      await Publisher.printUsage()

      assert(new Publisher(cwd, { git: 'true' })
        .ensureFreshTag({ name: 'foo', version: 'bar' }))
      assert(new Publisher(cwd, { npm: 'true', args: [] })
        .performRelease || true)
      assert(new Publisher(cwd, { git: 'true' })
        .tagRelease({ tag: 'test' }) || true)

      assert(await new Publisher(cwd, {
        verbose: true,
        dryRun: false,
        //@ts-ignore
        fetch: () => Promise.resolve({ status: 200 }),
      }).isPublished({ name: 'x', version: 'y' }))

      equal(await new Publisher(cwd, {
        //@ts-ignore
        fetch: () => Promise.resolve({ status: 404 })
      }).isPublished({ name: 'x', version: 'y' }), false)

      rejects(()=>new Publisher(cwd, {
        //@ts-ignore
        fetch: () => Promise.resolve({ status: 429 })
      }).isPublished({ name: 'x', version: 'y' }))

      deepEqual(makeSureRunIsDry(), ['--dry-run'])
      deepEqual(makeSureRunIsDry(['foo']), ['--dry-run', 'foo'])
      deepEqual(makeSureRunIsDry(['--dry-run', 'foo']), ['--dry-run', 'foo'])

      //for (const type of ['script', 'module']) {
        //assert(Package.patchPackageJson({
          //cwd,
          //pkgJson: { pkgJson: { type } },
          //distDtsExt,
          //distEsmExt,
          //distCjsExt
        //}))
      //}

      assert(new Publisher(cwd, {
        dryRun: true, npm: 'true', git: 'true',
        //@ts-ignore
        fetch: () => Promise.resolve({ status: 404 }),

        pkg: new Package('', { name: 'foo', version: 'bar', main: '' })
      }).releasePackage())

      assert(new Publisher(cwd, {
        dryRun: true, npm: 'true', git: 'true',
        //@ts-ignore
        fetch: () => Promise.resolve({ status: 404 }),

        pkg: new Package('', { private: true })
      }).releasePackage())

    } finally {
      await rimraf(join(cwd, 'dist'))
      process.chdir(previousCwd)
    }
  }
}
