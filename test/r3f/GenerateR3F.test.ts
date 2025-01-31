import { GLTF } from 'node-three-gltf'
import { beforeEach, describe, expect, it } from 'vitest'

import { AnalyzedGLTF, GeneratedR3F, loadGLTF, resolveModelLoadPath } from '../../src/index.js'
import {
  assertFileExists,
  fixtureGenerateOptions,
  models,
  resolveFixtureModelFile,
  types,
} from '../fixtures.js'

describe('GenerateR3F', () => {
  for (const modelName of models) {
    describe(modelName, () => {
      for (const type of types) {
        const modelFile = resolveFixtureModelFile(modelName, type)

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
            const m = await loadGLTF(modelFile)
            const options = fixtureGenerateOptions({
              componentName: modelName,
              draco: type.includes('draco'),
              header: 'FOO header',
              modelLoadPath: resolveModelLoadPath(modelFile, '/public/models'),
              // types: true,
              keepnames: true,
              shadows: true,
              instanceall: type.includes('instanceall'),
            })
            const a = new AnalyzedGLTF(m, options)
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
