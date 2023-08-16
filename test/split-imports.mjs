import assert from 'node:assert'

import { Resolver, TSFile } from '../tool/resolver.mjs'

assert.throws(()=>new Resolver('./test.mjs'))

const resolver = new Resolver('./test/fixtures')

assert.equal(resolver.load(), resolver)

assert.throws(()=>resolver.resolve('fixture1', './missing') instanceof TSFile)

assert.throws(()=>resolver.resolve('fixture1', './foo.ts'))

assert.ok(resolver.resolve('fixture1', './foo') instanceof TSFile)

assert.equal(resolver.resolve('fixture1', 'foo'), null)

assert.ok(resolver.resolve('fixture1', './subdir3') instanceof TSFile)

assert.ok(resolver.resolve('fixture1', './subdir1') instanceof TSFile)

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
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
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
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  export default from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  export type { default as foo } from './foo'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  export type { default as foo } from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  export { default as foo } from './foo'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  export { default as foo } from './foo'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  import { default as foo } from 'package'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  import { default as foo } from 'package'
`)


file = new TSFile(resolver, 'fixture0.ts', `
  import { foo } from './missing'
`)
assert.throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './mixed'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  import { Foo } from './mixed';
  import type { Bar, Baz } from './mixed';
`)


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz, Quux } from './mixed'
`)
assert.throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './subdir3'
`)
assert.throws(()=>file.patch())


file = new TSFile(resolver, 'fixture0.ts', `
  import { Foo, Bar, Baz } from './subdir1'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  import { Foo } from "./subdir1/index";
  import type { Bar, Baz } from "./subdir1/index";
`)

file = new TSFile(resolver, 'fixture0.ts', `
  export { Foo, Bar, Baz } from './subdir1'
`)
assert.equal(file.patch(), file)
assert.equal(file.save(true), `
  export { Foo } from "./subdir1/index";
  export type { Bar, Baz } from "./subdir1/index";
`)

const case1 = new Resolver('./test/fixtures/case1')
case1.load(['.'])
console.log(case1.patch().save(true))
