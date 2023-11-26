/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */


export { default as Error } from './src/Error.mjs'
export * as Parse from './src/parse.mjs'
export { default as Resolver } from './src/Resolver.mjs'
export * from './src/run.mjs'
export { default as Package } from './src/Package.mjs'
export { default as Publisher } from './src/Publisher.mjs'
export { default as TSCompiler } from './src/TSCompiler.mjs'
import Ubik, { console, bold } from './package.mjs'
export * as Dirs from './src/dirs.mjs'
export * as ImportMap from './src/importmap.mjs'
export * as Merge from './src/merge.mjs'
export * as Split from './src/split.mjs'
export * from './src/namespace.mjs'

export function printUsage ({ info } = console) {
  info('Welcome to', bold(`@hackbg/ubik ${Ubik.version}`))
    .info('Supported operations:')
  for (const [[command, ...parameters], description] of [
    [['--help'],
      'Provide more detailed descriptions of what each command does and why.'],
    [['split-types', '[--dry]', '[subdirs...]'],
      'Fix types imported without "import type"'],
    [['split-stars', '[--dry]', 'packagenames...', '--', 'sourcedirs...'],
      `Fix default imports of CommonJS modules imported as ESM by Node`],
    [['fix-import-dirs', '[--dry]', '[subdirs...]'],
      `Add missing directory indices`],
    [['merge-package', '[--dry]', 'packages...', '--', 'sources...'],
      `Merge another package into this one`],
    [['make-import-map', '[--dry] [subdirs...]'],
      `Generate importmap.json from node_modules`],
    [['compile', '[--dry]'],
      `Compile package to ESM only, fixing the missing extensions.`],
    [['release', '[--dry] [--compile|--compile-dual]'],
      `Publish this package to NPM and push a version tag.`],
  ]) {
    info(' ', bold(command), ...parameters).info('    ', description)
  }
  info(`The ${bold(`--dry`)} flag performs a "dry run":`)
    .info(`it performs all the code mods, but does not write`)
    .info(`the results to disk.`)
}

export function printHelp ({ info } = console) {
  info('Welcome to', bold(`@hackbg/ubik ${Ubik.version}`))
    .info()
    .info('Supported operations:')
  for (const [[command, ...parameters], description] of [
    [['split-types', '[--dry]', '[subdirs...]'], [
      'Some TS packages use "import" indiscriminately for values *and* types.',
      'They rely on the bundler to ultimately tell apart the two and strip the',
      'types before execution.',
      '',
      'But in case you just want to compile the TS to JS, you will find that',
      'the type imports show in the compiled code as missing value imports,',
      'and the runtime will throw a SyntaxError.',
      '',
      'This command visits every TypeScript file in your project (or just from',
      'the specified', bold('subdirs')+'), identifies which specifiers in the',
      '"import" or "export ... from" are actually types, and puts those in',
      'separate "import type" or "export type ... from" declarations.',
      'This way, TypeScript strips them at compile time and your code can run.',
    ]],
    [['split-stars', '[--dry]', 'packagenames...', '--', 'sourcedirs...'], [
      'In Node.js, when a ESM package imports a CommonJS package using "import *"',
      'an extra "default" key may be added around the imported package contents.',
      'TypeScript doesn\'t know about this, and just gets confused. This command',
      'changes the import statement to add a destructuring assignment, and updates',
      'the type namespace so both Node and TypeScript can find their stuff.',
    ]],
    [['fix-import-dirs', '[--dry]', '[subdirs...]'], [
      `Some packages use directory imports, i.e. 'import "./path/to/directory" is`,
      `assumed to mean 'import "./path/to/directory/index". This is non-standard`,
      `behavior, specific to the Node.js runtime in CommonJS mode.`,
      '',
      `Again, bundlers usually paper over the issue. What's even better`,
      `is having valid code in the first place. This command detects when`,
      `an import or reexport points to a directory, and changes it to point`,
      `to "index.ts" within that directory.`,
      '',
      `It also warns you if both "./foo/bar.ts" and "./foo/bar/index.ts" exist,`,
      `which is ambiguous; Ubik resolves it in favor of the first one.`
    ]],
    [['merge-package', '[--dry]', 'packages...', '--', 'sources...'], [
      'With workspace support in package managers becoming mainstream,',
      'splitting your code across multiple NPM packages becomes handy -',
      'especially if you want to let people not download dependencies for',
      'parts of your project that they are not using.',
      '',
      'However, in some cases splitting a project into subpackages',
      'may be premature: more packages means more NPM records that you',
      'need to keep up to date.',
      '',
      'Worry not! This command lets you merge another package into the',
      'current one, replacing imports/reexports with the corresponding',
      'relative paths.'
    ]],
    [['make-import-map', '[--dry] [subdirs...]'], [
      `Import maps exist and are well supported by browsers. But we've been`,
      `unable to find a tool that reliably generates one, much less a tool that`,
      `applies patches and shims for packages that do not yet publish natively`,
      `ESM-compatible builds. This command does the former, and will eventually`,
      `expose hooks for defining the latter.`
    ]],
    [['compile', '[--dry]'], [
      'The original Ubik fix for TypeScript\'s dirty little secret.',
      '',
      'First of all, this command compiles your TypeScript package',
      'into both ESM and CJS formats. This allows you to maintain backwards',
      'compatibility with CommonJS and synchronous imports. Nifty!',
      '',
      'What\'s more, TS nudges you to use ESM import syntax (ever seen a',
      '"require type"? there isn\'t one - and mixing "require" with ',
      '"import type" is weird) but at the same time the ESM code that ',
      'TS outputs is plain invalid: while TS disallows extensions in "import",',
      'the ES Module Specification *requires* them. TS does nothing about that,',
      'just happily emits invalid modules.',
      '',
      'Once again, the unwritten assumption is that you are expected to',
      '"just" depend on a bundler to finish TypeScript\'s work. Instead of',
      'complaining on GitHub and letting the maintainers tell you that you',
      'are complaining wrong, run this command. It will compile your code,',
      'then add the missing extensions like it\'s noone\'s business.',
    ]],
    [['release', '[--dry] [--compile|--compile-dual]'], [
      'Publishing a package should not take more than one step.',
      '',
      'This command publishes the current package to NPM',
      '(optionally compiling to ESM+DTS or ESM+CJS+DTS),',
      'tags the current commit with "@npm/$PACKAGE/$VERSION",',
      'and pushes the tag to upstream (but not the branch).',
      '',
      'Publishing fails fast if there already exists a published',
      'version with the current version number.',
    ]],
  ]) {
    info().info(' ', bold(command), ...parameters)
    for (const line of description) {
      info('    ', line)
    }
  }
  info()
    .info(`The ${bold(`--dry`)} flag performs a "dry run":`)
    .info(`it performs all the code mods, but does not write`)
    .info(`the results to disk.`)
}
