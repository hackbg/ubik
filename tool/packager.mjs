//@ts-check
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { UbikError } from './error.mjs'
import { console, bold } from '../tool/logger.mjs'

/** Load package.json. Bail if already modified. */
export function readPackageJson ({
  cwd,
  path        = join(cwd, 'package.json'),
  packageJson = JSON.parse(readFileSync(path, 'utf8')),
  skipFixed   = process.env.UBIK_SKIP_FIXED
}) {
  if (packageJson['ubik']) {
    if (skipFixed) {
      console.warn(`Package ${bold(packageJson.name)} @ ${bold(packageJson.version)} already contains key "ubik"; skipping.`)
      return { packageJson, skip: true }
    } else {
      throw new UbikError.ModifiedPackageJSON(path)
    }
  }
  if (packageJson['private']) {
    console.log(`Package ${bold(packageJson.name)} is private; skipping.`)
    return { packageJson, skip: true }
  }
  return { packageJson }
}
