import {bold} from '@hackbg/logs'

export class UbikError extends Error {

  static ModifiedPackageJSON = class ModifiedPackageJSON extends UbikError {
    constructor (path) {
      super(
        `This is already the modified, temporary package.json. Restore the original ` +
        `(e.g. "mv package.json.bak package.json" or "git checkout package.json") and try again`
      )
      this.path = path
    }
  }

  static TagAlreadyExists = class TagAlreadyExists extends UbikError {
    constructor (tag) {
      super(
        `Git tag ${tag} already exists. ` +
        `Increment version in package.json or delete tag to proceed.`
      )
    }
  }

  static NPMErrorCode = class NPMErrorCode extends UbikError {
    constructor (code, name, version) {
      super(
        `ubik: NPM returned ${bold(String(code))} ` +
        `when looking for ${bold(name)} @ ${bold(version)}`
      )
    }
  }

  static WrongMainExtension = class WrongMainExtension extends UbikError {
    constructor () {
      super(
        'UBIK_FORCE_TS is on, but "main" has "js" extension. '+
        'Make "main" point to the TS index'
      )
    }
  }

  static RunFailed = class RunFailed extends UbikError {
    constructor (commands = []) {
      super(
        'Running external commands failed. See log output for details.'
      )
      this.commands = commands
    }
  }

}

