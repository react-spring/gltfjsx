import { GLTF } from 'node-three-gltf'
import { Bone, Material, Mesh, Object3D, Vector3 } from 'three'

import { descObj3D } from '../Log.js'
import { AnalyzedGLTFOptions } from '../options.js'
import { Props } from '../utils/types.js'
import {
  isBone,
  isColored,
  isDecayed,
  isDistanced,
  isFn,
  isInstancedMesh,
  isLight,
  isMesh,
  isNotRemoved,
  isOrthographicCamera,
  isPerspectiveCamera,
  isPoints,
  isRemoved,
  isSkinnedMesh,
  isSpotLight,
  isTargetedLight,
} from './is.js'
import { allPruneStrategies, PruneStrategy } from './pruneStrategies.js'
import {
  collectMaterials,
  materialKey,
  meshKey,
  nodeName,
  sanitizeMeshName,
  sanitizeName,
} from './utils.js'

export interface DuplicateGeometry {
  count: number
  name: string
  node: string
}

/**
 * Analyze given GLTF, remove duplicates and prune the scene. This class is agnostic of the generated output
 * or target framework e.g. react-three-fiber.
 */
export class AnalyzedGLTF<O extends AnalyzedGLTFOptions = AnalyzedGLTFOptions> {
  public options: AnalyzedGLTFOptions
  public gltf: GLTF
  /**
   * Duplicates found in the scene
   */
  private dupMaterials: Record<string, number> = {}
  private dupGeometries: Record<string, DuplicateGeometry> = {}

  /** All objects in the scene */
  private objects: Object3D[] = []

  private pruneStrategies: PruneStrategy[]

  constructor(
    gltf: GLTF,
    options: Readonly<O>,
    pruneStrategies: PruneStrategy[] = allPruneStrategies,
  ) {
    this.gltf = gltf
    this.options = options
    this.pruneStrategies = pruneStrategies

    // Collect all objects in the scene
    this.gltf.scene.traverse((child: Object3D) => this.objects.push(child))

    this.collectDuplicates()
    this.pruneDuplicateGeometries()
    this.pruneAllStrategies()
  }

  /**
   * Determine if pruned scene contains any of the given objects (that have not been removed)
   */
  public includes(is: isFn) {
    for (const o of this.objects) {
      if (isNotRemoved(o) && is(o)) {
        return true
      }
    }
    return false
  }

  public hasAnimations() {
    return this.gltf.animations && this.gltf.animations.length > 0
  }

  public hasInstances(): boolean {
    return (this.options.instance || this.options.instanceall) &&
      Object.keys(this.dupGeometries).length > 0
      ? true
      : false
  }

  public getDuplicateGeometryValues(): DuplicateGeometry[] {
    return Object.values(this.dupGeometries)
  }

  public getMeshName(m: Mesh): string {
    return this.dupGeometries[meshKey(m)].name
  }

  public getMeshes(): Mesh[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.objects.filter((o) => isMesh(o) && isNotRemoved(o)) as any
  }

  public getBones(): Bone[] {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.objects.filter(
      (o) => isBone(o) && !(o.parent && isBone(o.parent)) && isNotRemoved(o),
    ) as any
  }

  public getMaterials(): Material[] {
    return [...new Set(this.getMeshes().flatMap((o) => collectMaterials(o.material)))]
  }

  public isInstanced(o: Object3D): boolean {
    if (!o) {
      throw new Error('o is undefined')
    }
    const { instance, instanceall } = this.options
    let instanced =
      (instance || instanceall) &&
      isMesh(o) &&
      o.geometry &&
      o.material &&
      this.dupGeometries[meshKey(o)] &&
      this.dupGeometries[meshKey(o)].count > (instanceall ? 0 : 1)
    instanced = instanced === undefined ? false : instanced
    return instanced
  }

  /**
   * Exposed for external PruneStrategies
   */
  public visitAndPrune(o: Object3D): Object3D {
    const { log, bones } = this.options

    // Check if the root node is useless
    if (isRemoved(o) && o.children.length) {
      o.children.forEach((child) => {
        this.visitAndPrune(child)
      })
      return o
    }

    // Bail out on bones
    if (!bones && isBone(o)) {
      return o
    }

    // Walk the children first
    if (o.children) {
      o.children.forEach((child) => {
        this.visitAndPrune(child)
      })
    }

    const pruned = this.prune(o)
    if (pruned) {
      log.debug('Pruned: ', descObj3D(o))
    }

    return o
  }

  /**
   * Calculate props for a given object based on input options
   */
  public calculateProps(o: Object3D): Props {
    if (!o) {
      throw new Error('o is undefined')
    }
    const props: Props = {}
    const node = nodeName(o)

    // name: include name when output is uncompressed or morphTargetDictionaries are present
    if (
      o.name.length &&
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      (this.options.keepnames || (o as any).morphTargetDictionary || this.hasAnimations())
    ) {
      props['name'] = o.name
    }

    // camera
    if (isPerspectiveCamera(o) || isOrthographicCamera(o)) {
      props['makeDefault'] = false
      if (o.zoom !== 1) props['zoom'] = this.rNbr(o.zoom)
      if (o.far !== 2000) props['far'] = this.rNbr(o.far)
      if (o.near !== 0.1) props['near'] = this.rNbr(o.near)
    }
    if (isPerspectiveCamera(o)) {
      if (o.fov !== 50) props['fov'] = this.rNbr(o.fov)
    }

    // Meshes
    if (isMesh(o)) {
      // Mesh shadows
      if (this.options.shadows) {
        props['castShadow'] = true
        props['receiveShadow'] = true
      }

      // non-instanced
      if (!this.isInstanced(o)) {
        if (!isInstancedMesh(o)) {
          // geometry
          props['geometry'] = `${node}.geometry`

          // material
          const materialName = materialKey(o.material)
          if (materialName) props['material'] = `materials${sanitizeName(materialName)}`
          else props['material'] = `${node}.material`
        }
      }

      // InstancedMesh
      if (isInstancedMesh(o)) {
        if (o.instanceMatrix) props['instanceMatrix'] = `${node}.instanceMatrix`
        if (o.instanceColor) props['instanceColor'] = `${node}.instanceColor`

        const materialName = materialKey(o.material)
        const mat = materialName ? `materials${sanitizeName(materialName)}` : `${node}.material`
        props['args'] = `[${node}.geometry, ${mat}, ${!o.count ? `${node}.count` : o.count}]`
      }

      // SkinnedMesh
      if (isSkinnedMesh(o)) props['skeleton'] = `${node}.skeleton`
    }

    // Points
    if (isPoints(o)) {
      props['morphTargetDictionary'] = `${node}.morphTargetDictionary}`
      props['morphTargetInfluences'] = `${node}.morphTargetInfluences}`
    }

    // Lights
    if (isLight(o)) {
      if (this.rNbr(o.intensity)) props['intensity'] = this.rNbr(o.intensity)

      //if (o.power && o.power !== 4 * Math.PI) props['power'] = ${this.rNbr(o.power)} `
      if (isSpotLight(o)) {
        if (o.angle !== Math.PI / 3) props['angle'] = this.rDeg(o.angle)
        if (o.penumbra && this.rNbr(o.penumbra) !== 0) props['penumbra'] = this.rNbr(o.penumbra)
      }

      // SpotLight | PointLight
      if (isDecayed(o)) {
        if (o.decay && this.rNbr(o.decay) !== 1) props['decay'] = this.rNbr(o.decay)
      }
      if (isDistanced(o)) {
        if (o.distance && this.rNbr(o.distance) !== 0) props['distance'] = this.rNbr(o.distance)
      }
      // Lights with targets - return
      if (isTargetedLight(o)) {
        props['target'] = `${node}.target`
      }
    }

    // Object3D
    if (o.visible === false) props['visible'] = false
    if (o.castShadow === true) props['castShadow'] = true
    if (o.receiveShadow === true) props['receiveShadow'] = true
    if (o.up && o.up.isVector3 && !o.up.equals(new Vector3(0, 1, 0))) {
      props['up'] = `[${this.rNbr(o.up.x)}, ${this.rNbr(o.up.y)}, ${this.rNbr(o.up.z)}]`
    }

    // color
    if (isColored(o) && o.color.getHexString() !== 'ffffff') {
      props['color'] = `"#${o.color.getHexString()}"`
    }
    // position
    if (o.position && o.position.isVector3 && this.rNbr(o.position.length())) {
      props['position'] =
        `[${this.rNbr(o.position.x)}, ${this.rNbr(o.position.y)}, ${this.rNbr(o.position.z)}]`
    }
    // rotation
    if (
      o.rotation &&
      o.rotation.isEuler &&
      this.rNbr(new Vector3(o.rotation.x, o.rotation.y, o.rotation.z).length())
    ) {
      props['rotation'] =
        `[${this.rDeg(o.rotation.x)}, ${this.rDeg(o.rotation.y)}, ${this.rDeg(o.rotation.z)}]`
    }
    // scale
    if (
      o.scale &&
      o.scale.isVector3 &&
      !(this.rNbr(o.scale.x) === 1 && this.rNbr(o.scale.y) === 1 && this.rNbr(o.scale.z) === 1)
    ) {
      const rX = this.rNbr(o.scale.x)
      const rY = this.rNbr(o.scale.y)
      const rZ = this.rNbr(o.scale.z)
      if (rX === rY && rX === rZ) {
        props['scale'] = rX
      } else {
        props['scale'] = `[${rX}, ${rY}, ${rZ}]`
      }
    }
    // userData
    if (this.options.meta && o.userData && Object.keys(o.userData).length) {
      props['userData'] = JSON.stringify(o.userData)
    }
    return props
  }

  //
  protected rNbr(n: number) {
    return parseFloat(n.toFixed(Math.round(this.options.precision || 3)))
  }

  protected rDeg(n: number) {
    const abs = Math.abs(Math.round(n * 100000))
    for (let i = 1; i <= 10; i++) {
      if (abs === Math.round((Math.PI / i) * 100000))
        return `${n < 0 ? '-' : ''}Math.PI${i > 1 ? ' / ' + i : ''}`
    }
    for (let i = 1; i <= 10; i++) {
      if (abs === Math.round(Math.PI * i * 100000))
        return `${n < 0 ? '-' : ''}Math.PI${i > 1 ? ' * ' + i : ''}`
    }
    return this.rNbr(n)
  }

  /**
   * Create a unique name for the geometry given the list of duplicates
   */
  private uniqueGeometryName(attempt: string, index = 0): string {
    const newAttempt = index > 0 ? attempt + index : attempt
    if (Object.values(this.dupGeometries).find(({ name }) => name === newAttempt) === undefined)
      return newAttempt
    else return this.uniqueGeometryName(attempt, index + 1)
  }

  private collectDuplicates() {
    // collect duplicates
    this.gltf.scene.traverse((o: Object3D) => {
      if (isMesh(o)) {
        const mesh = o as Mesh
        // materials
        this.colectDuplicateMaterial(mesh.material)

        // geometry
        if (mesh.geometry) {
          const key = meshKey(mesh)
          if (!this.dupGeometries[key]) {
            this.dupGeometries[key] = {
              count: 1,
              name: this.uniqueGeometryName(sanitizeMeshName(mesh)),
              node: nodeName(mesh), // 'nodes' + sanitizeName(mesh.name),
            }
          } else {
            this.dupGeometries[key].count++
          }
        }
      }
    })
  }

  private colectDuplicateMaterial(material: Material | Material[]) {
    if (Array.isArray(material)) {
      material.forEach((m) => this.colectDuplicateMaterial(m))
    } else {
      if (material.name) {
        if (!this.dupMaterials[material.name]) {
          this.dupMaterials[material.name] = 1
        } else {
          this.dupMaterials[material.name]++
        }
      }
    }
  }

  private pruneDuplicateGeometries() {
    // Prune duplicate geometries
    if (!this.options.instanceall) {
      for (const key of Object.keys(this.dupGeometries)) {
        const duplicate = this.dupGeometries[key]
        // if there is only one geometry, it's not a duplicate and we won't instance it
        if (duplicate.count === 1) {
          delete this.dupGeometries[key]
          this.options.log.debug(`Deleted duplicate Geometry: ${duplicate.name}`)
        }
      }
    }
  }

  private pruneAllStrategies() {
    const { log, keepgroups } = this.options
    try {
      if (!keepgroups) {
        // Dry run to prune graph
        this.visitAndPrune(this.gltf.scene)
        this.compact()
      }
      // 2nd pass to eliminate hard to swat left-overs
      this.visitAndPrune(this.gltf.scene)
      this.compact()
    } catch (e) {
      log.error('Error during pruneAnalyzedGLTF: ', e)
    }
  }

  /**
   * Reorganize graph and remove deleted objects
   */
  private compact() {
    // Move children of deleted objects to their new parents
    this.objects.forEach((o) => {
      if (isRemoved(o)) {
        let parent = o.parent
        // Making sure we don't add to a removed parent
        while (parent && isRemoved(parent)) parent = parent.parent
        // If no parent was found it must be the root node
        if (!parent) parent = this.gltf.scene
        o.children.slice().forEach((child) => parent.add(child))
      }
    })

    // Remove deleted objects
    this.objects.forEach((o) => {
      if (isRemoved(o) && o.parent) o.parent.remove(o)
    })
  }

  private prune(o: Object3D): boolean {
    const props = this.calculateProps(o)

    for (const pruneStrategy of this.pruneStrategies) {
      if (isNotRemoved(o)) {
        if (pruneStrategy(this, o, props)) {
          return true
        }
      }
    }
    return false
  }
}
