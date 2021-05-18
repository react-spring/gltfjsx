<img src="logo.svg">
<br />
<br/>

[![Version](https://img.shields.io/npm/v/@react-three/gltfjsx?style=flat&colorA=000000&colorB=000000)](https://www.npmjs.com/package/@react-three/gltfjsx) [![Discord Shield](https://img.shields.io/discord/740090768164651008?style=flat&colorA=000000&colorB=000000&label=discord&logo=discord&logoColor=ffffff)](https://discord.gg/ZZjjNvJ)

A small command-line tool that turns GLTF assets into declarative and re-usable [react-three-fiber](https://github.com/pmndrs/react-three-fiber) JSX components. See it in action here: https://github.com/drcmda/floating-shoe

The usual GLTF workflow is cumbersome: objects can only be found by traversal, changes are made by mutation, making contents conditional is hard. Gltfjsx creates a nested graph of all the objects and materials inside your asset, it will not touch or modify your files in any way. Now you can easily make the data dynamic, alter contents, add events, etc.

## Usage

```bash
Usage
  npx gltfjsx [path/to/model.gltf] [options]

Options
  --types, -t      Add Typescript definitions
  --verbose, -v    Verbose output w/ names and empty groups
  --shadows, s     Let meshes cast and receive shadows
  --printwidth, w  Prettier printWidth (default: 120)
  --meta, -m       Include metadata (as userData)
  --precision, -p  Number of fractional digits (default: 2)
  --draco, -d      Draco binary path
  --root, -r       Sets directory from which .gltf file is served

Examples
  npx gltfjsx model.glb -t
```

Or as an online-service: https://gltf.pmnd.rs

### A typical use-case

1️⃣ First you run your model through gltfjsx. `npx` allows you to use npm packages without installing them.

```bash
npx gltfjsx model.gltf
```

2️⃣ It creates a javascript file that plots out all of the assets contents. The original gltf must still be be in your /public folder of course.

```jsx
/*
auto-generated by: https://github.com/react-spring/gltfjsx
author: abcdef (https://sketchfab.com/abcdef)
license: CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)
source: https://sketchfab.com/models/...
title: Model
*/

import React from 'react'
import { useLoader } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei/useGLTF'
import { PerspectiveCamera } from '@react-three/drei/PerspectiveCamera'

export default function Model(props) {
  const { nodes, materials } = useGLTF('model.gltf')
  return (
    <group {...props} dispose={null}>
      <group name="Camera" position={[10, 0, 50]} rotation={[Math.PI / 2, 0, 0]}>
        <PerspectiveCamera fov={40} near={10} far={1000} />
      </group>
      <group name="Sun" position={[100, 50, 100]} rotation={[-Math.PI / 2, 0, 0]}>
        <pointLight intensity={10} />
      </group>
      <mesh geometry={nodes.Cube_003_0.geometry} material={materials.base} />
      <mesh geometry={nodes.Cube_003_1.geometry} material={materials.inner} />
    </group>
  )
}

useGLTF.preload('/model.gltf')
```

3️⃣ This component can now be dropped into your scene. It is asynchronous and therefore must be wrapped into `<Suspense>` which gives you full control over intermediary loading-fallbacks and error handling.

```jsx
import { Canvas } from '@react-three/fiber'
import React, { Suspense } from 'react'
import Model from './Model'

function App() {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Model />
      </Suspense>
```

4️⃣ Now you can make the model dynamic.

Change colors for example:

```jsx
<mesh geometry={nodes.Cube_003_1.geometry} material={materials.inner} material-color="green" />
```

Or exchange materials:

```jsx
<mesh geometry={nodes.Cube_003_1.geometry}>
  <meshStandardMaterial color="hotpink" />
</mesh>
```

Make contents conditional:

```jsx
{condition && <mesh geometry={nodes.Cube_003_1.geometry} material={materials.inner} />}
```

Add events:

```jsx
<mesh geometry={nodes.Cube_003_1.geometry} material={materials.inner} onClick={handleClick} />
```

## Features

#### Clean output

- It only writes out an immutable graph, linking up the existing geometries and materials
- It will ommit empty groups or objects that don't serve a purpose, unless you opt into verbose mode (`-v`)
- It tries it's best to represent angles in the shortest way (as fractions of PI)
- It ommits names and userData, unless you opt into it (`-m`)

#### Draco compression

You don't need to do anything if your models are draco compressed, since `useGLTF` defaults to a draco CDN (`https://www.gstatic.com/draco/v1/decoders/`). By adding the `--draco` flag you can refer to [local binaries](https://github.com/mrdoob/three.js/tree/dev/examples/js/libs/draco/gltf) which must reside in your /public folder.

#### Animation

If your GLTF contains animations it will add [drei's](https://github.com/pmndrs/drei) `useAnimations` hook, which extracts all clips and prepares them as actions:

```jsx
const { nodes, materials, animations } = useGLTF('/model.gltf')
const { actions } = useAnimations(animations, group)
```

If you want to play an animation you can do so at any time:

```jsx
<mesh onClick={(e) => actions.jump.play()} />
```

if you want to blend animations:

```jsx
const [name, setName] = useState("jump")
...
useEffect(() => {
  actions[name].reset().fadeIn(0.5).play()
  return () => actions[name]].fadeOut(0.5)
}, [name])
```

#### Preload

The asset will be preloaded by default, this makes it quicker to load and reduces time-to-paint. Remove the preloader if you don't need it.

```jsx
export default function Model(props) {
  const { nodes, materials } = useGLTF('/model.gltf')
  ...
}

useGLTF.preload('/model.gltf')
```

#### Types

Add the `--types` flag and your GLTF will be typesafe.

```tsx
type GLTFResult = GLTF & {
  nodes: {
    cube1: THREE.Mesh
    cube2: THREE.Mesh
  }
  materials: {
    base: THREE.MeshStandardMaterial
    inner: THREE.MeshStandardMaterial
  }
}

export default function Model(props: JSX.IntrinsicElements['group']) {
  const { nodes, materials } = useGLTF<GLTFResult>('/model.gltf')
```

## Using the parser stand-alone

```jsx
import { parse } from '@react-three/gltfjsx'
import { GLTFLoader, DRACOLoader } from 'three-stdlib'

const gltfLoader = new GLTFLoader()
const dracoloader = new DRACOLoader()
dracoloader.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/')
gltfLoader.setDRACOLoader(dracoloader)

gltfLoader.load(url, (gltf) => {
  const jsx = parse(filename, gltf, config)
})
```

## Requirements

- Nodejs must be installed
- The GLTF file has to be present in your projects `/public` folder
- [three](https://github.com/mrdoob/three.js/) (>= 121.x)
- [@react-three/fiber](https://github.com/pmndrs/react-three-fiber) (>= 5.x)
- [@react-three/drei](https://github.com/pmndrs/drei) (>= 2.x)
