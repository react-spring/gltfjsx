import { Object3D } from 'three'

import { AnalyzedGLTF } from '../analyze/AnalyzedGLTF.js'
import { isBone, isInstancedMesh, isMesh, isTargetedLight } from '../analyze/is.js'

/**
 * r3f specific determination of jsx component?  If not, this could be moved to AnalyzeGLTF.
 */
export function getJsxElementName(o: Object3D, a: AnalyzedGLTF): string {
  let e = o.type.charAt(0).toLowerCase() + o.type.slice(1)

  // least specific to most specific, last one wins
  if (e === 'object3D') e = 'group' // Turn object3d's into groups, it should be faster according to the threejs docs
  if (e === 'bone') e = 'primitive'
  if (e === 'perspectiveCamera') e = 'PerspectiveCamera'
  if (e === 'orthographicCamera') e = 'OrthographicCamera'

  //
  if (isMesh(o) && a.isInstanced(o)) e = `instances.${a.getMeshName(o)}`
  if (isInstancedMesh(o)) e = 'instancedMesh'

  return e
}

export function isPrimitive(o: Object3D) {
  if (isTargetedLight(o)) {
    return true
  }
  if (isBone(o)) {
    return true
  }

  return false
}
