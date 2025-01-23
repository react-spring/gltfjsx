#!/usr/bin/env node
import fs from 'node:fs'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import meow from 'meow'
import { readPackageUpSync } from 'read-pkg-up'

import { createJsx } from './createJsx.js'
import gltfTransform from './gltfTransform.js'
import { readGLTF } from './readGLTF.js'
import { CliOptions, LogFn, pickOptions } from './types.js'
import {
  compareFileSizes,
  resolveComponentName,
  resolveModelLoadPath,
  resolveOutputSrcFile,
} from './utils/files.js'

/**
 * Separate the CLI from the main function to allow for testing.  CLI is responsible for IO.
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const cli = meow(
  // --outputModel, -om  Output model file name/path e.g. ./public/MyModel.glb (default: <Model>-transformed.glb)
  `
	Usage
  $ npx gltfjsx <Model.glb> <options>
  
	Options
    --output, -o        Output src file name/path (default: Model.(j|t)sx)
    --draco, -d         Draco binary path
    --types, -t         Add Typescript definitions
    --keepnames, -k     Keep original names
    --keepgroups, -K    Keep (empty) groups, disable pruning
    --bones, -b         Lay out bones declaratively (default: false)
    --meta, -m          Include metadata (as userData)
    --shadows, s        Let meshes cast and receive shadows
    --printwidth, w     Prettier printWidth (default: 120)
    --precision, -p     Number of fractional digits (default: 3)
    --root, -r          Sets directory from which .gltf file is served
    --exportdefault, -E Use default export
    --transform, -T     Apply a series of transformations to the GLTF file via the @gltf-transform libraries
        --instance, -i      Instance re-occuring geometry
        --instanceall, -I   Instance every geometry (for cheaper re-use)
        --resolution, -R  Resolution for texture resizing (default: 1024)
        --keepmeshes, -j  Do not join compatible meshes
        --keepmaterials, -M Do not palette join materials
        --keepattributes, Whether to keep unused vertex attributes, such as UVs without an assigned texture
        --format, -f      Texture format jpeg | png | webp | avif (default: "webp")
        --simplify, -S    Mesh simplification (default: false)
        --ratio         Simplifier ratio (default: 0)
        --error         Simplifier error threshold (default: 0.0001)
    --console, -c       Log JSX to console, won't produce a file
    --debug, -D         Debug output
`,
  {
    importMeta: import.meta,
    flags: {
      outputSrc: { type: 'string', shortFlag: 'os', default: 'Model.(j|t)sx' },
      // outputModel: { type: 'string', shortFlag: 'om', default: '<input name>-transformed.glb' },
      types: { type: 'boolean', shortFlag: 't' },
      keepnames: { type: 'boolean', shortFlag: 'k' },
      keepgroups: { type: 'boolean', shortFlag: 'K' },
      bones: { type: 'boolean', shortFlag: 'b', default: false },
      shadows: { type: 'boolean', shortFlag: 's' },
      meta: { type: 'boolean', shortFlag: 'm' },
      precision: { type: 'number', shortFlag: 'p', default: 3 },
      draco: { type: 'string', shortFlag: 'd' },
      root: { type: 'string', shortFlag: 'r' },
      instance: { type: 'boolean', shortFlag: 'i' },
      instanceall: { type: 'boolean', shortFlag: 'I' },
      // transform: { type: 'boolean', shortFlag: 'T' },
      resolution: { type: 'number', shortFlag: 'R', default: 1024 },
      degrade: { type: 'string', shortFlag: 'q', default: '' },
      degraderesolution: { type: 'number', shortFlag: 'Q', default: 512 },
      simplify: { type: 'boolean', shortFlag: 'S', default: false },
      keepmeshes: { type: 'boolean', shortFlag: 'j', default: false },
      keepmaterials: { type: 'boolean', shortFlag: 'M', default: false },
      keepattributes: { type: 'boolean', default: false },
      format: {
        type: 'string',
        choices: ['jpeg', 'png', 'webp', 'avif'],
        isMultiple: false,
        shortFlag: 'f',
        default: 'webp',
      },
      exportdefault: { type: 'boolean', shortFlag: 'E', default: false },
      ratio: { type: 'number', default: 0.75 },
      error: { type: 'number', default: 0.001 },
      console: { type: 'boolean', shortFlag: 'c', default: false },
      debug: { type: 'boolean', shortFlag: 'D', default: false },
    },
  },
)

const packageResult = readPackageUpSync({ cwd: __dirname, normalize: false })
if (!packageResult) {
  throw new Error(`No package.json found at or above ${__dirname}`)
}
const packageJson = packageResult.packageJson

if (cli.input.length === 0) {
  console.log(cli.help)
} else {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const cliOptions: CliOptions = cli.flags as any satisfies CliOptions

  // ./public/Model.{glb|gltf}
  const modelFile = path.resolve(cli.input[0])
  const { name: inputName, ext: inputExtension, dir: inputDir } = path.parse(modelFile)
  const log: LogFn = (args: any[]) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    console.info('log:', ...args)
  }

  //
  const {
    transformOptions,
    createJsxOptions: { log: _l, componentName: _cn, modelLoadPath: _mlp, ...createJsxOptions },
  } = pickOptions(cliOptions)

  //
  // Transform the GLTF file if necessary using gltf-transform
  //
  const shouldTransform = cliOptions.transform || cliOptions.instance || cliOptions.instanceall
  let size = ''
  let transformedModelFile: string | undefined = undefined
  if (shouldTransform) {
    transformedModelFile = path.resolve(inputDir, inputName + '-transformed.glb')
    await gltfTransform(modelFile, transformedModelFile, transformOptions)
    size = compareFileSizes(modelFile, transformedModelFile)
    // modelFile = transformedModelFile
  }

  //
  // Read the model
  //
  const modelGLTF = await readGLTF(transformedModelFile ? transformedModelFile : modelFile)

  //
  // Generate the JSX file
  //
  const outputSrcFile: string = resolveOutputSrcFile(cliOptions)
  const componentName = resolveComponentName(outputSrcFile)

  try {
    const response = await createJsx(modelGLTF, {
      log,
      componentName,
      header: `Auto-generated by: https://github.com/pmndrs/gltfjsx
Command: FIXME FIXME npx gltfjsx@${packageJson.version} ${process.argv.slice(2).join(' ')}`,
      modelLoadPath: resolveModelLoadPath(modelFile, cliOptions.root),
      ...createJsxOptions,
    })
    fs.writeFileSync(outputSrcFile, response)
  } catch (e) {
    console.error(e)
  }
}
