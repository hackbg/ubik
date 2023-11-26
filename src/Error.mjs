/** This is file is part of "Ubik", (c) 2023 Hack.bg, available under GNU AGPL v3.
  * You should have received a copy of the GNU Affero General Public License
  * along with this program.  If not, see <http://www.gnu.org/licenses/>. */
export default class UbikError extends Error {
  static required = (name) => {
    throw new UbikError(`Required parameter missing: ${name}`)
    return undefined
  }

  static ModifiedPackageJSON = class ModifiedPackageJSON extends UbikError {
    constructor (path) {
      super([
        `This is already the modified, temporary package.json. Restore the original ` +
        `(e.g. "mv package.json.bak package.json" or "git checkout package.json") and try again`
      ].join(' '))
      this.path = path
    }
  }

  static TagAlreadyExists = class TagAlreadyExists extends UbikError {
    constructor (tag) {
      super([
        `Git tag ${tag} already exists. `,
        `Increment version in package.json or delete tag to proceed.`
      ].join(' '))
    }
  }

  static NPMErrorCode = class NPMErrorCode extends UbikError {
    constructor (code, name, version) {
      super([
        `ubik: NPM returned ${String(code)}`,
        `when looking for ${name} @ ${version}`
      ].join(' '))
    }
  }

  static RunFailed = class RunFailed extends UbikError {
    constructor (commands = []) {
      super('Running external commands failed. See log output for details.')
      this.commands = commands
    }
  }

  static WrongMainExtension = class WrongMainExtension extends UbikError {
    constructor () {
      super([
        'UBIK_FORCE_TS is on, but "main" has "js" extension.',
        'Make "main" point to the TS index'
      ].join(' '))
    }
  }
}
