import { GLTF } from 'node-three-gltf'
import { beforeEach, describe, expect, it } from 'vitest'

import { AnalyzedGLTF } from '../../analyze/AnalyzedGLTF.js'
import { Log } from '../../Log.js'
import { readGLTF } from '../../readGLTF.js'
import { assertFileExists, models, resolveModelFile, types } from '../fixtures.js'

const log = new Log({ silent: false, debug: true })

describe('prune', () => {
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

          it('should prune', async () => {
            const m = await readGLTF(modelFile)

            const a = new AnalyzedGLTF(m, {
              log,
            })

            // const options = defaultJsxOptions({
            //   log,
            //   componentName: modelName,
            //   header: 'FOO header',
            //   modelLoadPath: resolveModelLoadPath(modelFile, '/public/models'),
            //   types: true,
            //   keepnames: true,
            //   shadows: true,
            // })
            // const jsx = await createR3FComponent(m, options)
            // console.log(jsx)
            assertCommon(m)
          })
        })
      }
    })
  }
})
