import assert from 'node:assert'
import { Resolver, TSFile } from '../tool/resolver.mjs'
import mergePackages from '../task/merge.mjs'
const resolver = new Resolver('test/fixtures/merge').load(['api', 'lib', 'types'])
mergePackages(resolver, ['types'])
