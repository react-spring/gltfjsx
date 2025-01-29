import { GLTF } from 'node-three-gltf'
import { beforeEach, describe, expect, it } from 'vitest'

import { readGLTF } from '../readGLTF.js'
import { assertFileExists, models, resolveFixtureModelFile, types } from './fixtures.js'

describe('readGLTF', () => {
  for (const modelName of models) {
    describe(modelName, () => {
      for (const type of types) {
        const modelFile = resolveFixtureModelFile(modelName, type)

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
            const m = await readGLTF(modelFile)
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
