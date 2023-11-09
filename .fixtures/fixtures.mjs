import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

export const fixturesDir = resolve(dirname(fileURLToPath(import.meta.url)))

export function fixture (...args) {
  return resolve(fixturesDir, ...args)
}
