import { DRACOLoader, GLTF } from 'node-three-gltf'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { loadGLTF } from '../src/index.js'
import { assertFileExists, models, resolveFixtureModelFile, types } from './fixtures.js'

describe('loadGLTF', () => {
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
          beforeEach(() => {
            assertFileExists(modelFile)
          })

          function assertCommon(m: GLTF) {
            expect(m.animations).not.toBeNull()
            expect(m.scenes).not.toBeNull()
            expect(m.scene).not.toBeNull()
            expect(m.scene.children).not.toBeNull()
            expect(m.scene.children.length).toBeGreaterThan(0)
            expect(m.parser).not.toBeNull()
            expect(m.parser.json).not.toBeNull()
          }

          it('should read', async () => {
            const m = await loadGLTF(modelFile, dracoLoader)
            assertCommon(m)

            // use GLTFExporter to export a scene or objects as json .gltf or binary .glb file
            // const exporter = new GLTFExporter()

            // const jsonData = await exporter.parseAsync(m.scene)
            // console.log(jsonData.nodes)
            // console.log(jsonData.materials)
            // fs.writeFileSync('export.gltf', JSON.stringify(jsonData, null, 2))

            // console.log(JSON.stringify(m.scene, null, 2))
            // expect(m).toMatchInlineSnapshot()
          })
        })
      }
    })
  }
})
