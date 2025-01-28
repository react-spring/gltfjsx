import { GLTF } from 'node-three-gltf'
import { beforeEach, describe, expect, it } from 'vitest'

import { AnalyzedGLTF } from '../../analyze/AnalyzedGLTF.js'
import { Log } from '../../Log.js'
import { GeneratedR3F } from '../../r3f/GenerateR3F.js'
import { readGLTF } from '../../readGLTF.js'
import { resolveModelLoadPath } from '../../utils/files.js'
import {
  assertFileExists,
  defaultJsxOptions,
  models,
  resolveModelFile,
  types,
} from '../fixtures.js'

const log = new Log({ silent: false, debug: false })

describe('GenerateR3F', () => {
  for (const modelName of models) {
    describe(modelName, () => {
      for (const type of types) {
        const modelFile = resolveModelFile(modelName, type)

        describe(type, () => {
          beforeEach(() => {
            assertFileExists(modelFile)
          })

          function assertCommon(m: GLTF) {
            // FIXME
            expect(m.animations).not.toBeNull()
            expect(m.scenes).not.toBeNull()
            expect(m.scene).not.toBeNull()
            expect(m.scene.children).not.toBeNull()
            expect(m.scene.children.length).toBeGreaterThan(0)
            expect(m.parser).not.toBeNull()
            expect(m.parser.json).not.toBeNull()
          }

          it('should generate', async () => {
            const m = await readGLTF(modelFile)
            const options = defaultJsxOptions({
              log,
              componentName: modelName,
              draco: type.includes('draco'),
              header: 'FOO header',
              modelLoadPath: resolveModelLoadPath(modelFile, '/public/models'),
              types: true,
              keepnames: true,
              shadows: true,
              instanceall: type.includes('instanceall'),
            })
            const a = new AnalyzedGLTF(m, {
              instance: options.instance,
              instanceall: options.instanceall,
              log: options.log,
            })
            const g = new GeneratedR3F(a, options)
            const tsx = await g.toTsx()
            console.log(tsx)
            // const jsx = g.toJsx()
            // console.log(jsx)
            expect(tsx).toContain('FOO header')

            if (type.includes('instanceall')) {
              expect(tsx).toContain('<Merged')
              expect(tsx).toContain('const instances = React.useMemo(')
              expect(tsx).toContain('<instances.')
            }

            assertCommon(m)
          })
        })
      }
    })
  }
})
