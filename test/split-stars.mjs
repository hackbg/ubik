import assert from 'node:assert'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

import { separateNamespaceImport } from '../task/stars.mjs'

const fixture = x => join(dirname(fileURLToPath(import.meta.url)), 'fixtures', x)

assert.equal(
  separateNamespaceImport({ path: fixture('stars.ts'), packageName: 'foobar' }),
  readFileSync(fixture('stars-fixed.ts'), 'utf8')
)
