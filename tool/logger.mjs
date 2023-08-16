import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Console, bold } from '@hackbg/logs'

const ubikPackageJson = resolve(dirname(dirname(fileURLToPath(import.meta.url))), 'package.json')
const ubikVersion = JSON.parse(readFileSync(ubikPackageJson, 'utf8')).version
export const console = new Console(`@hackbg/ubik ${ubikVersion}`)
export { bold }
