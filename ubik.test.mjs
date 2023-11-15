#!/usr/bin/env node
/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */

Error.stackTraceLimit = 100

import { required } from './tool/tool-error.mjs'
import { throws } from 'node:assert'
throws(required)

import { printUsage, printHelp } from './task/task.mjs'
const mute = { info: () => mute }
printUsage(
  //@ts-ignore
  mute
)
printHelp(
  //@ts-ignore
  mute
)

await import('./tool/tool-package.test.mjs')
await import('./tool/tool-run.test.mjs')
await import('./task/task-merge.test.mjs')
await import('./task/task-compile.test.mjs')
await import('./task/task-dirs.test.mjs')
await import('./task/task-importmap.test.mjs')
await import('./task/task-publish.test.mjs')
await import('./task/task-split.test.mjs')
await import('./task/task-stars.test.mjs')
