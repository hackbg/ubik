/*

  Ubik: Module Resolver
  Copyright (C) 2023 Hack.bg

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.

**/

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, dirname, resolve, join as joinPath, sep } from 'node:path'
import recast from 'recast'

import { getImportsExports, getDefault } from './parser.mjs'
import { saveModifiedFile } from './writer.mjs'

import { separateTypeImports } from '../task/split.mjs'

import { Console, bold } from '@hackbg/logs'
const console = new Console('@hackbg/ubik')

/** Join path fragments, enforcing Unix-style path separator. */
export const join = (...fragments) => joinPath(...fragments).split(sep).join('/')

/** The resolver class is the root of an Ubik run.
  * It keeps track of all paths that are part of the
  * codebase that is being modified. */
export class Resolver extends Map {
  /** Create a new resolver. */
  constructor (root = '.') {
    super()
    if (!statSync(root).isDirectory()) {
      throw new Error(`${root} must be a directory`)
    }
    console.log(`Resolving from:`, bold(root))
    this.root = root
  }
  /** Recursively load contents of passed directories. */
  load (paths = readdirSync(this.root)) {
    for (let path of paths) {
      if (path === 'node_modules' || path.endsWith('/node_modules')) continue
      path = join(this.root, path)
      console.log('load:', bold(path))
      const stat = statSync(path)
      const relpath = relative(this.root, resolve(path))
      if (stat.isDirectory()) {
        this.set(relpath, new Directory(this, relpath))
        continue
      }
      if (stat.isFile()) {
        if (path.endsWith('.ts')) {
          this.set(relpath, new TSFile(this, relpath))
          continue
        } else if (path.endsWith('.json')) {
          this.set(relpath, new JSONFile(this, relpath))
          continue
        } else{
          this.set(relpath, new File(this, relpath))
          continue
        }
      }
    }
    return this
  }
  /** Resolve a reference (import or reexport) from `source` to `target`.
    * This assumes that the reference is by relative path, i.e. contained
    * in the same package. Package imports will return `null`. */
  resolve (source, target) {
    // Ignore package imports
    if (!target.startsWith('.')) {
      return null
    }
    // Fail on `.ts` extension
    if (target.endsWith('.ts')) {
      throw new Error('TypeScript disallows imports ending in .ts')
    }
    // Resolve the path
    let path = join(relative(this.root, resolve(this.root, dirname(source), target)))
    if (path.startsWith('./')) path = path.slice(2)
    // Non-TS files (such as JS or JSON imports)
    if (this.has(path) && this.get(path) instanceof File && !(this.get(path) instanceof TSFile)) {
      console.warn(`${bold(path)} is a non-TS import`)
      return this.get(path)
    }
    // TS files - need to add extension
    if (this.has(`${path}.ts`)) {
      // Warn about collision if there is both directory and file with the same name
      if (this.has(`${path}/index.ts`)) {
        console.warn(`
          both ${bold(`${path}.ts`)} and ${bold(`${path}/index.ts`)} exits: using first one
        `.trim())
      }
      return this.get(`${path}.ts`)
    }
    // Directories - need to add index.ts
    if (this.has(`${path}/index.ts`)) {
      console.warn(`
        ${bold(path)} is a directory import - this is invalid ESM and will be fixed
      `.trim())
      return this.resolve(source, `${target}/index`)
    }
    throw new Error(`${target}: not found (from ${source})`)
  }
  /** Apply the codemods. */
  patch () {
    return this.forEach(entry => {
      if (entry instanceof TSFile) entry.patch()
    })
  }
  /** Save the modified files. */
  save (dryRun = false) {
    const saved = new Map()
    this.forEach(entry => {
      if (entry instanceof TSFile) {
        const code = entry.save(dryRun)
        saved.set(entry.path, code)
      }
    })
    return saved
  }
  /** Call a transformation function for each entry in the resolver. */
  forEach (x, y) {
    super.forEach(x, y)
    return this
  }
}

/** Represents a file or directory. */
export class Entry {
  path
  constructor (resolver, path) {
    this.resolver = resolver
    this.path = resolve(resolver.root, path)
    Object.defineProperty(this, 'resolver', { enumerable: false })
  }
}

/** Represents a directory. */
export class Directory extends Entry {
  constructor (resolver, path) {
    super(resolver, path)
    const entries = readdirSync(this.path).map(entry=>{
      const joined = join(this.path, entry)
      return relative(resolver.root, joined)
    })
    this.resolver.load(entries)
  }
}

/** Represents a file. */
export class File extends Entry {
  constructor (resolver, path) {
    super(resolver, path)
  }
}

/** Represents a JSON file. */
export class JSONFile extends File {
  constructor (resolver, path) {
    super(resolver, path)
  }
  parse () {
    return JSON.parse(readFileSync(this.path, 'utf8'))
  }
}

/** Represents a TypeScript module. Keeps track of its imports and exports. */
export class TSFile extends File {
  source
  constructor (resolver, path, source = readFileSync(resolve(resolver.root, path), 'utf8')) {
    super(resolver, path)
    Object.defineProperty(this, 'source', { get () { return source } })
  }
  get parsed () {
    this.load()
    return this.parsed
  }
  get imports () {
    this.load()
    return this.imports
  }
  get importTypes () {
    this.load()
    return this.importTypes
  }
  get exports () {
    this.load()
    return this.exports
  }
  get exportTypes () {
    this.load()
    return this.exportTypes
  }
  get reexports () {
    this.load()
    return this.reexports
  }
  get reexportTypes () {
    this.load()
    return this.reexportTypes
  }
  /** Populate imports and exports */
  load () {
    const handles = getImportsExports(this.resolver, this.path, this.source)
    const {
      parsed, imports, importTypes, exports, exportTypes, reexports, reexportTypes
    } = handles
    const prop = value => ({ enumerable: true, writable: true, configurable: true, value })
    Object.defineProperties(this, {
      parsed:        prop(parsed),
      imports:       prop(imports),
      importTypes:   prop(importTypes),
      exports:       prop(exports),
      exportTypes:   prop(exportTypes),
      reexports:     prop(reexports),
      reexportTypes: prop(reexportTypes)
    })
  }
  /** Replace `import` with `import type` where appropriate. */
  patch () {
    return Object.assign(this, separateTypeImports(this))
  }
  /** Update AST with patched imports and write updated code. */
  save (dry = false) {
    return saveModifiedFile(this, dry)
  }
}
