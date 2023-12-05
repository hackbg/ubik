import assert, { equal, rejects } from 'node:assert'
import runConcurrently from './run.mjs'
assert.ok(runConcurrently({ commands: ['true', 'true'], verbose: true }))
rejects(()=>runConcurrently({ commands: ['true', 'false'], verbose: true }))
