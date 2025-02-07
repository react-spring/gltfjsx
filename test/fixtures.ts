import fs from 'node:fs'
import path from 'node:path'

import { expect } from 'vitest'

import { AnalyzedGLTFOptions, GenerateOptions, Log, WithRequired } from '../src/index.js'

export const types = [
  //
  'gltf',
  'gltf-transform-meshopt',
  'gltf-transform-draco',
  'gltf-transform-draco-instanceall',
]

export const models = ['FlightHelmet']

const log = new Log({ silent: false, debug: false })

export const resolveFixtureModelFile = (inModelName: string, type: string) => {
  let modelName
  const extension = type === 'gltf' ? 'gltf' : 'glb'

  switch (type) {
    case 'gltf-transform-draco-instanceall':
      modelName = inModelName + '-transformed'
      break
    default:
      modelName = inModelName
  }
  return path.join(
    path.dirname(new URL(import.meta.url).pathname), // this dir
    `./models/${inModelName}/${type}/${modelName}.${extension}`,
  )
}

export const assertFileExists = (path: string) => {
  expect(fs.existsSync(path), `File not found: ${path}`).toBe(true)
}

const sharedFixtureOptions = {
  log,
}

export const fixtureAnalyzeOptions = (
  input: Partial<AnalyzedGLTFOptions> = {},
): AnalyzedGLTFOptions => {
  const o: AnalyzedGLTFOptions = {
    ...sharedFixtureOptions,
    ...input,
  }
  return o
}

export const fixtureGenerateOptions = (
  input: WithRequired<Partial<GenerateOptions>, 'componentName' | 'modelLoadPath' | 'draco'>,
): GenerateOptions => {
  const o: GenerateOptions = {
    ...sharedFixtureOptions,
    ...input,
  }
  return o
}
