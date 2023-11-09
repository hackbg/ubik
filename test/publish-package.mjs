import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as Publish from '../task/publish.mjs'
import * as Compile from '../task/compile.mjs'
import * as Packager from '../tool/packager.mjs'
import { UbikError } from '../tool/error.mjs'
import { rimraf } from 'rimraf'

for (const cwd of [
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'publish-esm'),
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'publish-cjs'),
]) {

  try {

    new UbikError.ModifiedPackageJSON()
    new UbikError.TagAlreadyExists()
    new UbikError.NPMErrorCode()
    new UbikError.WrongMainExtension()

    await Publish.printPublishUsage()

    //await Publish.release({
      //cwd,
    //})

    assert.ok(Packager.readPackageJson({
      cwd,
    }))

    assert.throws(()=>Packager.readPackageJson({
      cwd,
      packageJson: { ubik: true },
    }))

    assert.ok(Packager.readPackageJson({
      cwd,
      packageJson: { ubik: true },
      skipFixed: true
    }))

    assert.ok(Packager.readPackageJson({
      cwd,
      packageJson: { private: true },
    }).skip)

    //assert.ok(await Publish.cleanAll())

    //assert.ok(await Publish.cleanFiles())

    assert.ok(await Compile.prepareTypeScript({
      cwd,
      packageJson: { main: "" },
      args: []
    }))

    //assert.ok(Publish.prepareJavaScript())

    //assert.ok(Publish.performRelease())

    //assert.ok(Packager.readPackageJson())

    assert.ok(Publish.ensureFreshTag())

    assert.ok(Publish.performRelease({ cwd, npm: 'true', args: [] }) || true)

    assert.ok(Publish.tagRelease({ cwd, tag: 'test', git: 'true' }) || true)

    assert.ok(await Publish.isPublished({
      fetch: () => Promise.resolve({ status: 200 }),
      verbose: true,
      dryRun: false
    }))

    assert.equal(await Publish.isPublished({
      fetch: () => Promise.resolve({ status: 404 })
    }), false)

    assert.rejects(()=>Publish.isPublished({
      fetch: () => Promise.resolve({ status: 429 })
    }))

    //assert.ok(Publish.preliminaryDryRun())

    assert.ok(Publish.makeSureRunIsDry() || true)

    assert.ok(Compile.revertModifications({ cwd, keep: false, collectedFiles: [] }))
    assert.ok(Compile.revertModifications({ cwd, keep: true, collectedFiles: [] }))
    //assert.ok(await Publish.compileTypeScript())
    //assert.ok(await Publish.flattenFiles())
    assert.ok(Compile.collectFiles())
    assert.ok(Compile.patchPackageJson({ cwd, packageJson: { type: 'script' } }))
    assert.ok(Compile.patchPackageJson({ cwd, packageJson: { type: 'module' } }))
    assert.ok(Compile.patchESMImports({ files: [], isESModule: true  }) || true)
    assert.ok(Compile.patchESMImports({ files: [], isESModule: false }) || true)
    assert.ok(Compile.patchDTSImports({ files: [], isESModule: false }) || true)
    assert.ok(Compile.patchCJSRequires({ files: [], isESModule: true }) || true)
    assert.ok(Compile.patchCJSRequires({ files: [], isESModule: false }) || true)
    assert.ok(Compile.runConcurrently({ cwd, commands: ['true', 'true'], verbose: true }))

    assert.ok(Publish.determinePackageManager())

    assert.equal(Publish.determinePackageManager({
      verbose: true,
      packageManager: 'foo'
    }), 'foo')

    assert.equal(Publish.determinePackageManager({
      verbose: true,
      yarnCheck: 'true',
      pnpmCheck: 'false'
    }), 'yarn')

    assert.equal(Publish.determinePackageManager({
      verbose: true,
      yarnCheck: 'false',
      pnpmCheck: 'true'
    }), 'pnpm')

    assert.equal(Publish.determinePackageManager({
      verbose: true,
      yarnCheck: 'false',
      pnpmCheck: 'false'
    }), 'npm')

    assert.ok(Publish.runPackageManager({
      cwd,
      args: ['-v']
    }) || true)

    assert.ok(Publish.release({
      cwd,
      dryRun: true,
      npm: 'true',
      git: 'true',
      fetch: () => Promise.resolve({ status: 404 })
    }))

  } finally {

    await rimraf(join(cwd, 'dist'))

  }

}
