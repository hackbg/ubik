import assert, { rejects } from 'node:assert'
import { runConcurrently } from './tool-run.mjs'
assert.ok(runConcurrently({ commands: ['true', 'true'], verbose: true }))
rejects(()=>runConcurrently({ commands: ['true', 'false'], verbose: true }))
