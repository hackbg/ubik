import type { Logged } from '@hackbg/logs'

declare module "@hackbg/ubik" {

  namespace Task {

    namespace Publish {

      export class NPMPackagePublisher extends Logged {
        constructor (cwd: string, options?: {
          pkg?:          Partial<NPMPackage>
          git?:          string
          npm?:          string
          keep?:         boolean
          verbose?:      boolean
          dryRun?:       boolean
          args?:         string[]
          fetch?:        Function
        })
        releasePackage (): Promise<unknown>
      }

    }

  }

  namespace Tool {

    namespace Package {

      export class NPMPackage extends Logged {
        get name ():
          string
        get version ():
          string
        get main ():
          string
        get private ():
          boolean
        get ubik ():
          unknown
        get isTypeScript ():
          boolean
      }

    }

  }

}
