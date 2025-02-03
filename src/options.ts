import { TextureCompressOptions } from '@gltf-transform/functions'
import { Object3D } from 'three'
import { OptionalKind, PropertySignatureStructure } from 'ts-morph'

export interface LogOptions {
  silent: boolean
  debug: boolean
}

export type LogFn = (...args: any[]) => void

export interface Logger {
  debug: LogFn
  error: LogFn
  info: LogFn

  isDebug: () => boolean
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
  bones: boolean
  meta?: boolean
  shadows?: boolean
}

export interface AnalyzedGLTFOptions extends PropsOptions {
  precision: number
}

export type MappedProp = {
  /**
   * Object3D prop(s)
   * e.g. castShadow | [castShadow, receiveShadow]
   * */
  to: string | string[]
  /**
   * Match a specific type of object.
   * If not provided, matches all that have the {to} prop
   * */
  matcher?: (o: Object3D) => boolean
  /**
   * ts-morph prop structure (name is already supplied)
   * */
  structure: Omit<OptionalKind<PropertySignatureStructure>, 'name'>
}

export interface GenerateOptions extends PropsOptions {
  componentName: string
  draco: boolean
  exportdefault: boolean
  header?: string
  /**
   * Map component prop -> Object3D props
   * e.g. shadows->[castShadow, receiveShadow]
   */
  mapComponentProps?: Record<string, MappedProp>
  modelLoadPath: string
  precision: number
  size?: string // human readable size
}

export interface CliOptions
  extends TransformOptions,
    Omit<GenerateOptions, 'componentName' | 'modelLoadPath' | 'log'>,
    Omit<AnalyzedGLTFOptions, 'log'> {
  console: boolean
  debug: boolean
  draco: boolean
  // delay: number
  output?: string
  root?: string
  // timeout: number
  transform?: boolean
  types: boolean
}
