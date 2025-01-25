import { GLTF } from 'node-three-gltf'
import { Material, Mesh, Object3D } from 'three'

import { descObj3D } from '../Log.js'
import { PropsOptions } from '../options.js'
import { calculateProps } from './calculateProps.js'
import { isBone, isMesh, isNotRemoved, isRemoved } from './is.js'
import { allPruneStrategies, PruneStrategy } from './pruneStrategies.js'
import { meshKey, nodeName, sanitizeMeshName } from './utils.js'

export interface AnalyzedGLTFOptions extends PropsOptions {
  precision?: number
}

export interface ObjectInfo {
  node: string
  instanced: boolean
  animated: boolean
}

/**
 * Analyze given GLTF, remove duplicates and prune the scene
 */
export class AnalyzedGLTF {
  /**
   * Duplicates found in the scene
   */
  public dupMaterials: Record<string, number> = {}
  public dupGeometries: Record<string, { count: number; name: string; node: string }> = {}

  /** All objects in the scene */
  public objects: Object3D[] = []

  public gltf: GLTF
  public options: AnalyzedGLTFOptions

  private pruneStrategies: PruneStrategy[]

  constructor(
    gltf: GLTF,
    options: AnalyzedGLTFOptions,
    pruneStrategies: PruneStrategy[] = allPruneStrategies,
  ) {
    this.gltf = gltf
    this.options = options
    this.pruneStrategies = pruneStrategies

    // Collect all objects in the scene
    this.gltf.scene.traverse((child: Object3D) => this.objects.push(child))

    // Collect all duplicates
    this.collectDuplicates()

    // Prune duplicate geometries
    this.pruneDuplicates()

    // Prune all (other) strategies
    this.pruneAllStrategies()
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

  public rNbr(n: number) {
    return parseFloat(n.toFixed(Math.round(this.options.precision || 2)))
  }

  public rDeg(n: number) {
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

  public getInfo(obj: Object3D): ObjectInfo {
    if (!obj) {
      throw new Error('obj is undefined')
    }
    const { instance, instanceall } = this.options
    const node = nodeName(obj)
    let instanced =
      (instance || instanceall) &&
      isMesh(obj) &&
      obj.geometry &&
      obj.material &&
      this.dupGeometries[meshKey(obj)] &&
      this.dupGeometries[meshKey(obj)].count > (instanceall ? 0 : 1)
    instanced = instanced === undefined ? false : instanced
    return { /*type,*/ node, instanced, animated: this.hasAnimations() }
  }

  public visitAndPrune(obj: Object3D): Object3D {
    const { log, bones } = this.options

    // Check if the root node is useless
    if (isRemoved(obj) && obj.children.length) {
      obj.children.forEach((child) => {
        this.visitAndPrune(child)
      })
      return obj
    }

    // Bail out on bones
    if (!bones && isBone(obj)) {
      return obj
    }

    // Walk the children first
    if (obj.children) {
      obj.children.forEach((child) => {
        this.visitAndPrune(child)
      })
    }

    const pruned = this.prune(obj)
    if (pruned) {
      log.debug('Pruned: ', descObj3D(obj))
    }

    return obj
  }

  //
  private uniqueName(attempt: string, index = 0): string {
    const newAttempt = index > 0 ? attempt + index : attempt
    if (Object.values(this.dupGeometries).find(({ name }) => name === newAttempt) === undefined)
      return newAttempt
    else return this.uniqueName(attempt, index + 1)
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
              name: this.uniqueName(sanitizeMeshName(mesh)),
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

  private pruneDuplicates() {
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

  private prune(obj: Object3D): boolean {
    const props = calculateProps(obj, this)

    for (const pruneStrategy of this.pruneStrategies) {
      if (isNotRemoved(obj)) {
        if (pruneStrategy(this, obj, props)) {
          return true
        }
      }
    }
    return false
  }
}
