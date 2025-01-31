import { Euler, Material, Mesh, Object3D } from 'three'

import { isMaterial } from './is.js'
import isVarName from './isVarName.js'

/**
 * Analysis related utilities non-specific to any component library such as react-three-fiber.
 */

export function equalOrNegated(a: Euler, b: Euler) {
  return (
    (a.x === b.x || a.x === -b.x) &&
    //
    (a.y === b.y || a.y === -b.y) &&
    //
    (a.z === b.z || a.z === -b.z)
  )
}

export function sanitizeMeshName(mesh: Mesh) {
  let name = (mesh.name || 'Part').replace(/[^a-zA-Z_-]/g, '') // sanitize to only letters
  name = name.charAt(0).toUpperCase() + name.slice(1)
  return name
}

export function sanitizeName(name: string) {
  return isVarName(name) ? `.${name}` : `['${name}']`
}

export function materialKey(material: Material | Material[]) {
  if (Array.isArray(material)) {
    const result: string[] = []
    material.forEach((m) => m.name && result.push(m.name))
    if (result.length > 0) {
      return result.join('-')
    }
    return null
  } else {
    return material.name
  }
}

export function meshKey(mesh: Mesh) {
  // Was: child.geometry.uuid + (child.material?.name)
  // but we need to handle arrays of materials according to types
  return `mesh-${sanitizeMeshName(mesh)}-${mesh.geometry?.uuid}-${materialKey(mesh.material)}`
}

export function nodeName(o: Object3D) {
  return 'nodes' + sanitizeName(o.name)
}

/**
 * Collect all materials as an array
 *
 * @param material Material | Material[]
 * @returns
 */
export function collectMaterials(material: Material | Material[]): Material[] {
  if (Array.isArray(material)) {
    const result: Material[] = []
    material.forEach((m) => result.concat(collectMaterials(m)), [])
    const set = new Set(result)
    return Array.from(set)
  } else {
    if (!isMaterial(material)) {
      throw new Error('Not a material: ' + typeof material)
    }
    return [material]
  }
}
