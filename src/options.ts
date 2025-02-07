import { TextureCompressOptions } from '@gltf-transform/functions'
import { Object3D } from 'three'
import { OptionalKind, PropertySignatureStructure } from 'ts-morph'

import { AnalyzedGLTF } from './analyze/AnalyzedGLTF.js'

export interface LogOptions {
  silent: boolean
  debug: boolean
}

export type LogFn = (...args: any[]) => void

export interface Logger {
  debug: LogFn
  error: LogFn
  info: LogFn

  isDebugEnabled: () => boolean
}

interface BaseOptions {
  instance?: boolean
  instanceall?: boolean
  keepgroups?: boolean
  keepnames?: boolean
}

export interface TransformOptions extends BaseOptions {
  console: boolean
  degrade: string
  degraderesolution: number
  error: number
  format: TextureCompressOptions['targetFormat']

  keepattributes: boolean
  keepmaterials: boolean
  keepmeshes: boolean

  ratio: number
  resolution: number
  simplify: boolean
}

export interface PropsOptions extends BaseOptions {
  log: Logger
  bones?: boolean
  meta?: boolean
  shadows?: boolean
}

export interface AnalyzedGLTFOptions extends PropsOptions {
  precision?: number
}

export interface MappedProp {
  /**
   * Object3D prop(s)
   * e.g. castShadow | [castShadow, receiveShadow]
   * */
  to: string | string[]
  /**
   * Match a specific type of object.
   * If not provided, matches all that have the {to} prop
   * */
  matcher?: (o: Object3D, a: AnalyzedGLTF) => boolean
  /**
   * ts-morph prop structure (name is already supplied)
   * */
  structure: Omit<OptionalKind<PropertySignatureStructure>, 'name'>
}

export interface GenerateOptions extends PropsOptions {
  /**
   * Set the component name (default: 'Model') which also
   *  is used to determine the
   */
  componentName: string
  /**
   * Use draco compression in useGLTF()
   */
  draco?: boolean
  /**
   * Export the component as default
   */
  exportDefault?: boolean
  /**
   * Set the source file header
   */
  header?: string
  /**
   * Expose component prop and propagate to matching Object3D props
   * e.g. shadows->[castShadow, receiveShadow]
   */
  exposeProps?: Record<string, MappedProp>
  /**
   * Load path for the model for useGLTF()
   */
  modelLoadPath: string
  /**
   * file size to include in auto-generated header (assuming header option is undefined)
   */
  size?: string // human readable size
}

export interface CliOptions
  extends TransformOptions,
    Omit<GenerateOptions, 'componentName' | 'modelLoadPath' | 'log'>,
    Omit<AnalyzedGLTFOptions, 'log'> {
  console: boolean
  debug: boolean
  output?: string
  root?: string
  transform?: boolean
  types: boolean
}
