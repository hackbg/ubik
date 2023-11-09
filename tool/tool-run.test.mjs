import assert from 'node:assert'
import { runConcurrently } from './tool-run.mjs'
assert.ok(runConcurrently({ commands: ['true', 'true'], verbose: true }))
