/**
 * References:
 *  - https://github.com/Brakebein/node-three-gltf/tree/main (maintained!)
 */
import path from 'node:path'

import { DRACOLoader, GLTF, GLTFLoader } from 'node-three-gltf'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

import { isObject3D } from './analyze/is.js'
import { readFileToArrayBuffer } from './utils/files.js'

/**
 * Read a GLTF file and return the GLTF object.
 */
export async function loadGLTF(modelFilename: string): Promise<GLTF> {
  const modelBuffer = readFileToArrayBuffer(modelFilename)
  //
  // Setup loader
  //
  const dracoLoader = new DRACOLoader()
  const ktx2Loader = new KTX2Loader()
  ktx2Loader.setTranscoderPath('three/addons/jsm/libs/basis/')

  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)
  loader.setKTX2Loader(ktx2Loader)
  loader.setMeshoptDecoder(MeshoptDecoder)

  const modelDir = path.parse(modelFilename).dir + path.sep
  return new Promise((resolve, reject) => {
    loader.parse(
      modelBuffer,
      modelDir, // provide the reference path for relative resources
      async (gltf: GLTF) => {
        if (isObject3D(gltf)) {
          console.error('gltf is Object3D, in what case is this?', gltf)
          // Wrap scene in a GLTF Structure
          gltf = { scene: gltf, animations: [], parser: { json: {} } } as unknown as GLTF
        }
        dracoLoader.dispose() // https://github.com/Brakebein/node-three-gltf/issues/19
        resolve(gltf)
      },
      (error) => {
        reject(error as Error)
      },
    )
  })
}
