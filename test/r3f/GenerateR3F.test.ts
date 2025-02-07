import { DRACOLoader, GLTF } from 'node-three-gltf'
import { SyntaxKind } from 'ts-morph'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  AnalyzedGLTF,
  GenerateOptions,
  GenerateR3F,
  isMesh,
  loadGLTF,
  resolveModelLoadPath,
} from '../../src/index.js'
import {
  assertFileExists,
  fixtureAnalyzeOptions,
  fixtureGenerateOptions,
  resolveFixtureModelFile,
  types,
} from '../fixtures.js'

const modelName = 'FlightHelmet'
describe('GenerateR3F', () => {
  describe(modelName, () => {
    for (const type of types) {
      const modelFile = resolveFixtureModelFile(modelName, type)

      describe(type, () => {
        let model: GLTF
        let options: GenerateOptions
        let a: AnalyzedGLTF
        let dracoLoader: DRACOLoader

        beforeAll(() => {
          dracoLoader = new DRACOLoader()
        })
        afterAll(() => {
          dracoLoader.dispose()
        })

        beforeEach(async () => {
          assertFileExists(modelFile)
          model = await loadGLTF(modelFile, dracoLoader)
          options = fixtureGenerateOptions({
            componentName: modelName,
            draco: type.includes('draco'),
            header: 'FOO header',
            modelLoadPath: resolveModelLoadPath(modelFile, '/public/models'),
            // types: true,
            keepnames: true,
            shadows: true,
            instanceall: type.includes('instanceall'),
          })
          a = new AnalyzedGLTF(model, fixtureAnalyzeOptions(options))
        })

        function assertCommon(g: GenerateR3F) {
          expect(g.project).not.toBeNull()
          expect(g.src).not.toBeNull()
          expect(g.gltfInterface).not.toBeNull()
          expect(g.propsInterface).not.toBeNull()
          expect(g.instancesFn).not.toBeNull()
          expect(g.fn).not.toBeNull()
          expect(g.groupRoot).not.toBeNull()
          expect(g.groupRoot.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length).toEqual(
            6,
          )
        }

        function assertInstanceAllCommon(code: string) {
          expect(code).toContain('<Merged')
          expect(code).toContain('const instances = React.useMemo(')
        }

        it.concurrent('should generate', async () => {
          const g = new GenerateR3F(a, options)

          const tsx = await g.toTsx()
          console.log(tsx)
          const jsx = await g.toJsx()
          assertCommon(g)

          for (const code of [tsx, jsx]) {
            expect(code).toContain('FOO header')

            if (type.includes('instanceall')) {
              assertInstanceAllCommon(code)
              expect(code.match(/<instances\..*castShadow/g)?.length).toEqual(6)
              expect(code.match(/<instances\..*receiveShadow/g)?.length).toEqual(6)
            } else {
              expect(code.match(/castShadow/g)?.length).toEqual(6)
              expect(code.match(/receiveShadow/g)?.length).toEqual(6)
            }
          }
        })

        describe('exposeProps', () => {
          it.concurrent('should generate to[]', async () => {
            const mo: GenerateOptions = {
              ...options,
              exposeProps: {
                shadows: {
                  to: ['castShadow', 'receiveShadow'],
                  structure: {
                    type: 'boolean',
                    hasQuestionToken: true,
                  },
                },
              },
            }
            const g = new GenerateR3F(a, mo)
            assertCommon(g)
            const tsx = await g.toTsx()
            console.log(tsx)
            const jsx = await g.toJsx()

            for (const code of [tsx, jsx]) {
              if (type.includes('instanceall')) {
                assertInstanceAllCommon(code)
                expect(code.match(/<instances/g)?.length).toEqual(6)
                expect(code.match(/.*receiveShadow=\{shadows\}/g)?.length).toEqual(6)
                expect(code.match(/.*castShadow=\{shadows\}/g)?.length).toEqual(6)
              } else {
                expect(code.match(/castShadow=\{shadows\}/g)?.length).toEqual(6)
                expect(code.match(/receiveShadow=\{shadows\}/g)?.length).toEqual(6)
              }
            }
          })

          it.concurrent('should generate to (singular)', async () => {
            const mo: GenerateOptions = {
              ...options,
              exposeProps: {
                shadows: {
                  to: 'castShadow',
                  structure: {
                    type: 'boolean',
                    hasQuestionToken: true,
                  },
                },
              },
            }
            const g = new GenerateR3F(a, mo)
            assertCommon(g)
            const tsx = await g.toTsx()
            console.log(tsx)
            const jsx = await g.toJsx()

            for (const code of [tsx, jsx]) {
              if (type.includes('instanceall')) {
                assertInstanceAllCommon(code)
                expect(code.match(/<instances\..*castShadow=\{shadows\}/g)?.length).toEqual(6)
                expect(code.match(/<instances\..*receiveShadow /g)?.length).toEqual(6)
              } else {
                expect(code.match(/castShadow=\{shadows\}/g)?.length).toEqual(6)
                expect(code.match(/receiveShadow\n/g)?.length).toEqual(6)
              }
            }
          })

          describe('matcher', () => {
            it.concurrent('should limit matches', async () => {
              const mo: GenerateOptions = {
                ...options,
                exposeProps: {
                  shadows: {
                    to: 'castShadow',
                    structure: {
                      type: 'boolean',
                      hasQuestionToken: true,
                    },
                    matcher: (o) => isMesh(o) && o.name === 'GlassPlastic_low',
                  },
                },
              }
              const g = new GenerateR3F(a, mo)
              assertCommon(g)
              const tsx = await g.toTsx()
              console.log(tsx)
              const jsx = await g.toJsx()

              for (const code of [tsx, jsx]) {
                if (type.includes('instanceall')) {
                  assertInstanceAllCommon(code)
                  expect(code.match(/<instances\..*castShadow=\{shadows\}/g)?.length).toEqual(1)
                  expect(code.match(/<instances\..*receiveShadow /g)?.length).toEqual(6)
                } else {
                  expect(code.match(/castShadow=\{shadows\}/g)?.length).toEqual(1)
                  expect(code.match(/receiveShadow\n/g)?.length).toEqual(6)
                }
              }
            })

            // e.g. visible - it may not be present in calculated (because it defaults to true),
            // but we need to be sure we add it to a matched case to ensure propagation
            it.concurrent('should propagate non-calculated property', async () => {
              const mo: GenerateOptions = {
                ...options,
                exposeProps: {
                  hoseVisible: {
                    to: 'visible',
                    structure: {
                      type: 'boolean',
                      hasQuestionToken: true,
                    },
                    matcher: (o) => isMesh(o) && o.name === 'Hose_low',
                  },
                },
              }
              const g = new GenerateR3F(a, mo)
              assertCommon(g)
              const tsx = await g.toTsx()
              console.log(tsx)
              const jsx = await g.toJsx()

              for (const code of [tsx, jsx]) {
                if (type.includes('instanceall')) {
                  assertInstanceAllCommon(code)
                  expect(code.match(/<instances\..*visible=\{hoseVisible\}/g)?.length).toEqual(1)
                } else {
                  expect(code.match(/visible=\{hoseVisible\}/g)?.length).toEqual(1)
                }
              }
            })
          })
        })
      })
    }
  })
})
