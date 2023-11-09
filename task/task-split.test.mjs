/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
import assert, { throws, equal } from 'node:assert'
import { Resolver, TSFile } from '../tool/tool-resolve.mjs'

throws(()=>new Resolver('./test.mjs'))

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


file = new TSFile(resolver, 'fixture0.ts', `
  export default from './foo'
`)
equal(file.patch(), file)
equal(file.save(true), `
  export default from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  export type { default as foo } from './foo'
`)
equal(file.patch(), file)
equal(file.save(true), `
  export type { default as foo } from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  export { default as foo } from './foo'
`)
equal(file.patch(), file)
equal(file.save(true), `
  export { default as foo } from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  import { default as foo } from 'package'
`)
equal(file.patch(), file)
equal(file.save(true), `
  import { default as foo } from 'package'
`)

file = new TSFile(resolver, 'fixture0.ts', `
  import { foo } from './missing'
`)
throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './mixed'
`)
equal(file.patch(), file)
equal(file.save(true), `
  import { Foo } from './mixed';
  import type { Bar, Baz } from './mixed';
`)


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz, Quux } from './mixed'
`)
throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './subdir3'
`)
throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './subdir1'
`)
equal(file.patch(), file)
equal(file.save(true), `
  import { Foo } from "./subdir1/index";
  import type { Bar, Baz } from "./subdir1/index";
`)

file = new TSFile(resolver, 'fixture0.ts', `
  export { Foo, Bar, Baz } from './subdir1'
`)
equal(file.patch(), file)
equal(file.save(true), `
  export { Foo } from "./subdir1/index";
  export type { Bar, Baz } from "./subdir1/index";
`)

const case1 = new Resolver('.fixtures/case1')
case1.load(['.'])
console.log(case1.patch().save(true))

