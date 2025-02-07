/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import {
  Bone,
  Camera,
  Color,
  Group,
  InstancedMesh,
  Light,
  Material,
  Mesh,
  Object3D,
  OrthographicCamera,
  PerspectiveCamera,
  PointLight,
  Points,
  SkinnedMesh,
  SpotLight,
} from 'three'

export type isFn = (o: any) => boolean

export const isObject3D = (o: any): o is Object3D => (o as any).isObject3D

export const isScene = (o: any): o is Group => isGroup(o) && o.parent === null

export const isGroup = (o: any): o is Group => (o as any).isGroup

export const isPoints = (o: any): o is Points => (o as any).isPoints

export const isBone = (o: any): o is Bone => (o as any).isBone

export const isMaterial = (o: any): o is Material => (o as any).isMaterial

export const isMesh = (o: any): o is Mesh => (o as any).isMesh

export const isSkinnedMesh = (o: any): o is SkinnedMesh => (o as any).isSkinnedMesh

export const isInstancedMesh = (o: any): o is InstancedMesh => (o as any).isInstancedMesh

export const isLight = (o: any): o is Light => (o as any).isLight

export const isSpotLight = (o: any): o is SpotLight => (o as any).isSpotLight

export const isPointLight = (o: any): o is PointLight => (o as any).isPointLight

interface Decayed {
  decay: number
}
export const isDecayed = (o: any): o is Decayed => (o as any).decay !== undefined

interface Distanced {
  distance: number
}
export const isDistanced = (o: any): o is Distanced => (o as any).distance !== undefined

interface Targeted {
  target: Object3D
}
export const isTargeted = (o: any): o is Targeted => (o as any).target !== undefined

// SpotLight and ...
export const isTargetedLight = (o: any): o is Targeted =>
  isLight(o) && isTargeted(o) && o.children[0] === o.target

export const isCamera = (o: any): o is Camera => (o as any).isCamera

export const isOrthographicCamera = (o: any): o is OrthographicCamera =>
  (o as any).isOrthographicCamera

export const isPerspectiveCamera = (o: any): o is PerspectiveCamera =>
  (o as any).isPerspectiveCamera

// interface Removeable {
//   __removed?: boolean
// }
export const isNotRemoved = (o: any): boolean => o.__removed === undefined || !o.__removed

export const isRemoved = (o: any): boolean => o.__removed !== undefined && o.__removed

export const setRemoved = (o: any, value = true): void => {
  o.__removed = value
}

interface Colored {
  color: Color
}
export const isColored = (o: any): o is Colored => (o as any).color !== undefined

export const isChildless = (o: Object3D): boolean => o.children.length === 0
