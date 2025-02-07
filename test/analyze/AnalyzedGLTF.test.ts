import { DRACOLoader, GLTF } from 'node-three-gltf'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { AnalyzedGLTF, isGroup, loadGLTF, Log } from '../../src/index.js'
import {
  assertFileExists,
  fixtureAnalyzeOptions,
  models,
  resolveFixtureModelFile,
  types,
} from '../fixtures.js'

const log = new Log({ silent: false, debug: true })

describe('AnalyzedGLTF', () => {
  for (const modelName of models) {
    describe(modelName, () => {
      for (const type of types) {
        const modelFile = resolveFixtureModelFile(modelName, type)

        let dracoLoader: DRACOLoader
        beforeAll(() => {
          dracoLoader = new DRACOLoader()
        })
        afterAll(() => {
          dracoLoader.dispose()
        })

        describe(type, () => {
          let m: GLTF
          let a: AnalyzedGLTF

          beforeEach(async () => {
            assertFileExists(modelFile)
            m = await loadGLTF(modelFile, dracoLoader)
            a = new AnalyzedGLTF(m, fixtureAnalyzeOptions())
          })

          it('should construct', async () => {
            // expect(a.objects.length).toBeGreaterThan(0)
            // expect(a.gltf).not.toBeNull()
            // expect(a.gltf).not.toBeNull()
          })

          describe('includes', () => {
            it('should work', async () => {
              expect(a.includes(isGroup)).toBe(false)
            })
          })
        })
      }
    })
  }
})
