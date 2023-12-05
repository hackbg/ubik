import assert, { equal } from 'node:assert'
import { determinePackageManager } from './Package.mjs'
assert(determinePackageManager())
equal('foo', determinePackageManager({ verbose: true, packageManager: 'foo' }))
equal('yarn', determinePackageManager({ verbose: true, yarnCheck: 'true', pnpmCheck: 'false' }))
equal('pnpm', determinePackageManager({ verbose: true, yarnCheck: 'false', pnpmCheck: 'true' }))
equal('npm',  determinePackageManager({ verbose: true, yarnCheck: 'false', pnpmCheck: 'false' }))
