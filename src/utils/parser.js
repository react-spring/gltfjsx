import * as THREE from 'three'
import * as prettier from 'prettier'
import babelParser from 'prettier/parser-babel.js'
import isVarName from './isVarName.js'

function parse(gltf, { fileName = 'model', ...options } = {}) {
  if (gltf.isObject3D) {
    // Wrap scene in a GLTF Structure
    gltf = { scene: gltf, animations: [], parser: { json: {} } }
  }

  const url = (fileName.toLowerCase().startsWith('http') ? '' : '/') + fileName
  const animations = gltf.animations
  const hasAnimations = animations.length > 0

  /** @type {Record<string, Object3D[]> */
  const slots = {}

  // Collect all objects
  const objects = []
  gltf.scene.traverse((child) => {
    objects.push(child);

    // Collect slots
    const slot = child.userData?.prop;
    const hasSlot = (slot && typeof slot === "string" && slot.length > 0);
    if (hasSlot)
    {
      const slotname = sanitizeSlotName(slot);
      slots[slotname] ? slots[slotname].push(child) : (slots[slotname] = [child]);
    }
  })

  // Browse for duplicates
  const duplicates = {
    names: {},
    materials: {},
    geometries: {},
  }

  function uniqueName(attempt, index = 0) {
    const newAttempt = index > 0 ? attempt + index : attempt
    if (Object.values(duplicates.geometries).find(({ name }) => name === newAttempt) === undefined) return newAttempt
    else return uniqueName(attempt, index + 1)
  }

  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      if (child.material) {
        if (!duplicates.materials[child.material.name]) {
          duplicates.materials[child.material.name] = 1
        } else {
          duplicates.materials[child.material.name]++
        }
      }
    }
  })

  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      if (child.geometry) {
        const key = child.geometry.uuid + child.material?.name ?? ''
        if (!duplicates.geometries[key]) {
          let name = (child.name || 'Part').replace(/[^a-zA-Z]/g, '')
          name = name.charAt(0).toUpperCase() + name.slice(1)
          duplicates.geometries[key] = {
            count: 1,
            name: uniqueName(name),
            node: 'nodes' + sanitizeName(child.name),
          }
        } else {
          duplicates.geometries[key].count++
        }
      }
    }
  })

  // Prune duplicate geometries
  if (!options.instanceall) {
    for (let key of Object.keys(duplicates.geometries)) {
      const duplicate = duplicates.geometries[key]
      if (duplicate.count === 1) delete duplicates.geometries[key]
    }
  }

  const hasInstances = (options.instance || options.instanceall) && Object.keys(duplicates.geometries).length > 0

  function sanitizeName(name) {
    return isVarName(name) ? `.${name}` : `['${name}']`
  }

  /** Ensure that a slot is a valid variable name e.g. must not contain spaces */
  function sanitizeSlotName(slotname) {
    return slotname.replaceAll(/[^a-zA-Z0-9]/g, '');
  }

  const rNbr = (number) => {
    return parseFloat(number.toFixed(Math.round(options.precision || 2)))
  }

  const rDeg = (number) => {
    const abs = Math.abs(Math.round(parseFloat(number) * 100000))
    for (let i = 1; i <= 10; i++) {
      if (abs === Math.round(parseFloat(Math.PI / i) * 100000))
        return `${number < 0 ? '-' : ''}Math.PI${i > 1 ? ' / ' + i : ''}`
    }
    for (let i = 1; i <= 10; i++) {
      if (abs === Math.round(parseFloat(Math.PI * i) * 100000))
        return `${number < 0 ? '-' : ''}Math.PI${i > 1 ? ' * ' + i : ''}`
    }
    return rNbr(number)
  }

  function printTypes(objects, animations) {
    let meshes = objects.filter((o) => o.isMesh && o.__removed === undefined)
    let bones = objects.filter((o) => o.isBone && !(o.parent && o.parent.isBone) && o.__removed === undefined)
    let materials = [...new Set(objects.filter((o) => o.material && o.material.name).map((o) => o.material))]

    let animationTypes = ''
    if (animations.length) {
      animationTypes = `\n
  type ActionName = ${animations.map((clip, i) => `"${clip.name}"`).join(' | ')};

  interface GLTFAction extends THREE.AnimationClip { name: ActionName }\n`
    }

    const types = [...new Set([...meshes, ...bones].map((o) => getType(o)))]
    const contextType = hasInstances
      ? `\ntype ContextType = Record<string, React.ForwardRefExoticComponent<
     ${types.map((type) => `JSX.IntrinsicElements['${type}']`).join(' | ')}
    >>\n`
      : ''

    return `\n${animationTypes}\ntype GLTFResult = GLTF & {
    nodes: {
      ${meshes.map(({ name, type }) => (isVarName(name) ? name : `['${name}']`) + ': THREE.' + type).join(',')}
      ${bones.map(({ name, type }) => (isVarName(name) ? name : `['${name}']`) + ': THREE.' + type).join(',')}
    }
    materials: {
      ${materials.map(({ name, type }) => (isVarName(name) ? name : `['${name}']`) + ': THREE.' + type).join(',')}
    }
    animations: GLTFAction[]
  }\n${contextType}`
  }

  function getType(obj) {
    let type = obj.type.charAt(0).toLowerCase() + obj.type.slice(1)
    // Turn object3d's into groups, it should be faster according to the threejs docs
    if (type === 'object3D') type = 'group'
    if (type === 'perspectiveCamera') type = 'PerspectiveCamera'
    if (type === 'orthographicCamera') type = 'OrthographicCamera'
    return type
  }

  function handleProps(obj) {
    let { type, node, instanced } = getInfo(obj)

    let result = ''
    let isCamera = type === 'PerspectiveCamera' || type === 'OrthographicCamera'
    // Handle cameras
    if (isCamera) {
      result += `makeDefault={false} `
      if (obj.zoom !== 1) result += `zoom={${rNbr(obj.zoom)}} `
      if (obj.far !== 2000) result += `far={${rNbr(obj.far)}} `
      if (obj.near !== 0.1) result += `near={${rNbr(obj.near)}} `
    }
    if (type === 'PerspectiveCamera') {
      if (obj.fov !== 50) result += `fov={${rNbr(obj.fov)}} `
    }

    if (!instanced) {
      // Shadows
      if (type === 'mesh' && options.shadows) result += `castShadow receiveShadow `

      // Write out geometry first
      if (obj.geometry && !obj.isInstancedMesh) {
        result += `geometry={${node}.geometry} `
      }

      // Write out materials
      if (obj.material && !obj.isInstancedMesh) {
        if (obj.material.name) result += `material={materials${sanitizeName(obj.material.name)}} `
        else result += `material={${node}.material} `
      }

      if (obj.instanceMatrix) result += `instanceMatrix={${node}.instanceMatrix} `
      if (obj.instanceColor) result += `instanceColor={${node}.instanceColor} `
      if (obj.skeleton) result += `skeleton={${node}.skeleton} `
      if (obj.visible === false) result += `visible={false} `
      if (obj.castShadow === true) result += `castShadow `
      if (obj.receiveShadow === true) result += `receiveShadow `
      if (obj.morphTargetDictionary) result += `morphTargetDictionary={${node}.morphTargetDictionary} `
      if (obj.morphTargetInfluences) result += `morphTargetInfluences={${node}.morphTargetInfluences} `
      if (obj.intensity && rNbr(obj.intensity)) result += `intensity={${rNbr(obj.intensity)}} `
      //if (obj.power && obj.power !== 4 * Math.PI) result += `power={${rNbr(obj.power)}} `
      if (obj.angle && obj.angle !== Math.PI / 3) result += `angle={${rDeg(obj.angle)}} `
      if (obj.penumbra && rNbr(obj.penumbra) !== 0) result += `penumbra={${rNbr(obj.penumbra)}} `
      if (obj.decay && rNbr(obj.decay) !== 1) result += `decay={${rNbr(obj.decay)}} `
      if (obj.distance && rNbr(obj.distance) !== 0) result += `distance={${rNbr(obj.distance)}} `
      if (obj.up && obj.up.isVector3 && !obj.up.equals(new THREE.Vector3(0, 1, 0)))
        result += `up={[${rNbr(obj.up.x)}, ${rNbr(obj.up.y)}, ${rNbr(obj.up.z)},]} `
    }

    if (obj.color && obj.color.getHexString() !== 'ffffff') result += `color="#${obj.color.getHexString()}" `
    if (obj.position && obj.position.isVector3 && rNbr(obj.position.length()))
      result += `position={[${rNbr(obj.position.x)}, ${rNbr(obj.position.y)}, ${rNbr(obj.position.z)},]} `
    if (
      obj.rotation &&
      obj.rotation.isEuler &&
      rNbr(new THREE.Vector3(obj.rotation.x, obj.rotation.y, obj.rotation.z).length())
    )
      result += `rotation={[${rDeg(obj.rotation.x)}, ${rDeg(obj.rotation.y)}, ${rDeg(obj.rotation.z)},]} `
    if (
      obj.scale &&
      obj.scale.isVector3 &&
      !(rNbr(obj.scale.x) === 1 && rNbr(obj.scale.y) === 1 && rNbr(obj.scale.z) === 1)
    ) {
      const rX = rNbr(obj.scale.x)
      const rY = rNbr(obj.scale.y)
      const rZ = rNbr(obj.scale.z)
      if (rX === rY && rX === rZ) {
        result += `scale={${rX}} `
      } else {
        result += `scale={[${rX}, ${rY}, ${rZ},]} `
      }
    }
    if (options.meta && obj.userData && Object.keys(obj.userData).length)
      result += `userData={${JSON.stringify(obj.userData)}} `

    return result
  }

  function getInfo(obj) {
    let type = getType(obj)
    let node = 'nodes' + sanitizeName(obj.name)
    let instanced =
      (options.instance || options.instanceall) &&
      obj.geometry &&
      obj.material &&
      duplicates.geometries[obj.geometry.uuid + obj.material.name] &&
      duplicates.geometries[obj.geometry.uuid + obj.material.name].count > (options.instanceall ? 0 : 1)
    let animated = gltf.animations && gltf.animations.length > 0
    const hasSlots = obj.userData?.prop && typeof obj.userData.prop === "string" && obj.userData.prop.length > 0;
    return { type, node, instanced, animated, hasSlots }
  }

  function equalOrNegated(a, b) {
    return (a.x === b.x || a.x === -b.x) && (a.y === b.y || a.y === -b.y) && (a.z === b.z || a.z === -b.z)
  }

  function prune(obj, children, result, oldResult, silent) {
    let { type, animated, hasSlots } = getInfo(obj)
    // Prune ...
    if (!obj.__removed && !options.keepgroups && !animated && !hasSlots && (type === 'group' || type === 'scene')) {
      /** Empty or no-property groups
       *    <group>
       *      <mesh geometry={nodes.foo} material={materials.bar} />
       *  Solution:
       *    <mesh geometry={nodes.foo} material={materials.bar} />
       */
      if (result === oldResult || obj.children.length === 0) {
        if (options.debug && !silent) console.log(`group ${obj.name} removed (empty)`)
        obj.__removed = true
        return children
      }

      // More aggressive removal strategies ...
      const first = obj.children[0]
      const firstProps = handleProps(first)
      const regex = /([a-z-A-Z]*)={([a-zA-Z0-9\.\[\]\-\,\ \/]*)}/g
      const keys1 = [...result.matchAll(regex)].map(([, match]) => match)
      const values1 = [...result.matchAll(regex)].map(([, , match]) => match)
      const keys2 = [...firstProps.matchAll(regex)].map(([, match]) => match)

      /** Double negative rotations
       *    <group rotation={[-Math.PI / 2, 0, 0]}>
       *      <group rotation={[Math.PI / 2, 0, 0]}>
       *        <mesh geometry={nodes.foo} material={materials.bar} />
       *  Solution:
       *    <mesh geometry={nodes.foo} material={materials.bar} />
       */
      if (obj.children.length === 1 && getType(first) === type && equalOrNegated(obj.rotation, first.rotation)) {
        if (keys1.length === 1 && keys2.length === 1 && keys1[0] === 'rotation' && keys2[0] === 'rotation') {
          if (options.debug && !silent) console.log(`group ${obj.name} removed (aggressive: double negative rotation)`)
          obj.__removed = first.__removed = true
          children = ''
          if (first.children) first.children.forEach((child) => (children += print(child, true)))
          return children
        }
      }

      /** Double negative rotations w/ props
       *    <group rotation={[-Math.PI / 2, 0, 0]}>
       *      <group rotation={[Math.PI / 2, 0, 0]} scale={0.01}>
       *        <mesh geometry={nodes.foo} material={materials.bar} />
       *  Solution:
       *    <group scale={0.01}>
       *      <mesh geometry={nodes.foo} material={materials.bar} />
       */
      if (obj.children.length === 1 && getType(first) === type && equalOrNegated(obj.rotation, first.rotation)) {
        if (keys1.length === 1 && keys2.length > 1 && keys1[0] === 'rotation' && keys2.includes('rotation')) {
          if (options.debug && !silent)
            console.log(`group ${obj.name} removed (aggressive: double negative rotation w/ props)`)
          obj.__removed = true
          // Remove rotation from first child
          first.rotation.set(0, 0, 0)
          children = print(first, true)
          return children
        }
      }

      /** Transform overlap
       *    <group position={[10, 0, 0]} scale={2} rotation={[-Math.PI / 2, 0, 0]}>
       *      <mesh geometry={nodes.foo} material={materials.bar} />
       *  Solution:
       *    <mesh geometry={nodes.foo} material={materials.bar} position={[10, 0, 0]} scale={2} rotation={[-Math.PI / 2, 0, 0]} />
       */
      const isChildTransformed = keys2.includes('position') || keys2.includes('rotation') || keys2.includes('scale')
      const hasOtherProps = keys1.some((key) => !['position', 'scale', 'rotation'].includes(key))
      if (obj.children.length === 1 && !first.__removed && !isChildTransformed && !hasOtherProps) {
        if (options.debug && !silent) console.log(`group ${obj.name} removed (aggressive: ${keys1.join(' ')} overlap)`)
        // Move props over from the to-be-deleted object to the child
        // This ensures that the child will have the correct transform when pruning is being repeated
        keys1.forEach((key) => obj.children[0][key].copy(obj[key]))
        // Insert the props into the result string
        children = print(first, true)
        obj.__removed = true
        return children
      }

      /** Lack of content
       *    <group position={[10, 0, 0]} scale={2} rotation={[-Math.PI / 2, 0, 0]}>
       *      <group position={[10, 0, 0]} scale={2} rotation={[-Math.PI / 2, 0, 0]}>
       *        <group position={[10, 0, 0]} scale={2} rotation={[-Math.PI / 2, 0, 0]} />
       * Solution:
       *   (delete the whole sub graph)
       */
      const empty = []
      obj.traverse((o) => {
        const type = getType(o)
        if (type !== 'group' && type !== 'object3D') empty.push(o)
      })
      if (!empty.length) {
        if (options.debug && !silent) console.log(`group ${obj.name} removed (aggressive: lack of content)`)
        empty.forEach((child) => (child.__removed = true))
        return ''
      }
    }
  }

  function print(obj, silent = false) {
    let result = ''
    let children = ''
    let { type, node, instanced, animated } = getInfo(obj)

    // Check if the root node is useless
    if (obj.__removed && obj.children.length) {
      obj.children.forEach((child) => (result += print(child)))
      return result
    }

    // Bail out on bones
    if (!options.bones && type === 'bone') {
      return `<primitive object={${node}} />`
    }

    // Take care of lights with targets
    if (type.endsWith('Light') && obj.target && obj.children[0] === obj.target) {
      return `<${type} ${handleProps(obj)} target={${node}.target}>
        <primitive object={${node}.target} ${handleProps(obj.target)} />
      </${type}>`
    }

    // Collect children
    if (obj.children) obj.children.forEach((child) => (children += print(child)))

    if (instanced) {
      result = `<instances.${duplicates.geometries[obj.geometry.uuid + obj.material.name].name} `
      type = `instances.${duplicates.geometries[obj.geometry.uuid + obj.material.name].name}`
    } else {
      if (obj.isInstancedMesh) {
        const geo = `${node}.geometry`
        const mat = obj.material.name ? `materials${sanitizeName(obj.material.name)}` : `${node}.material`
        type = "instancedMesh"
        result = `<instancedMesh args={[${geo}, ${mat}, ${!obj.count ? `${node}.count` : obj.count}]} `
      } else {
        // Form the object in JSX syntax
        if (type === 'bone') result = `<primitive object={${node}} `
        else result = `<${type} `
      }
    }

    // Include names when output is uncompressed or morphTargetDictionaries are present
    if (obj.name.length && (options.keepnames || obj.morphTargetDictionary || animated)) result += `name="${obj.name}" `

    const oldResult = result
    result += handleProps(obj)

    const pruned = prune(obj, children, result, oldResult, silent)
    // Bail out if the object was pruned
    if (pruned !== undefined) return pruned

    // Add custom slots if defined in the object's userData 
    // E.g. userData: { "prop" : "mySlot" } becomes `{ mySlot }`
    const slot = obj.userData?.prop;
    const hasSlot = (slot && typeof slot === "string" && slot.length > 0);
    const hasContent = children.length || hasSlot;


    // Close tag if no children
    result += `${hasContent ? '>' : '/>'}\n`

    // Add children
    if (children.length) result += `${children.trimEnd("\n")}\n`
    // Add custom slot
    if (hasSlot) result += `{${sanitizeSlotName(slot)}}\n`;
    // Close tag
    if (hasContent) {
    	if (type === 'bone') result += `</primitive>`
      	else result += `</${type}>`
    }
    return result
  }

  function printAnimations(animations) {
    return animations.length ? `\nconst { actions } = useAnimations(animations, group)` : ''
  }

  function parseExtras(extras) {
    if (extras) {
      return (
        Object.keys(extras)
          .map((key) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${extras[key]}`)
          .join('\n') + '\n'
      )
    } else return ''
  }

  function p(obj, line) {
    console.log(
      [...new Array(line * 2)].map(() => ' ').join(''),
      obj.type,
      obj.name,
      'pos:',
      obj.position.toArray().map(rNbr),
      'scale:',
      obj.scale.toArray().map(rNbr),
      'rot:',
      [obj.rotation.x, obj.rotation.y, obj.rotation.z].map(rNbr),
      'mat:',
      obj.material ? `${obj.material.name}-${obj.material.uuid.substring(0, 8)}` : ''
    )
    obj.children.forEach((o) => p(o, line + 1))
  }

  if (options.debug) p(gltf.scene, 0)

  let scene
  try {
    if (!options.keepgroups) {
      // Dry run to prune graph
      print(gltf.scene)
      // Move children of deleted objects to their new parents
      objects.forEach((o) => {
        if (o.__removed) {
          let parent = o.parent
          // Making sure we don't add to a removed parent
          while (parent && parent.__removed) parent = parent.parent
          // If no parent was found it must be the root node
          if (!parent) parent = gltf.scene
          o.children.slice().forEach((child) => parent.add(child))
        }
      })
      // Remove deleted objects
      objects.forEach((o) => {
        if (o.__removed && o.parent) o.parent.remove(o)
      })
    }
    // 2nd pass to eliminate hard to swat left-overs
    scene = print(gltf.scene)
  } catch (e) {
    console.log('Error while parsing glTF', e)
  }

  const slotParams = Object.keys(slots).length > 0 ? (Object.keys(slots).join(", ") + ", ") : "";

  const header = `/*
${options.header ? options.header : 'Auto-generated by: https://github.com/pmndrs/gltfjsx'} ${
    options.size ? `\nFiles: ${options.size}` : ''
  }

${parseExtras(gltf.parser.json.asset && gltf.parser.json.asset.extras)}*/`
  const hasPrimitives = scene.includes('<primitive')
  const result = `${options.types ? `\nimport * as THREE from 'three'` : ''}
        import React from 'react'${hasPrimitives ? '\nimport { useGraph } from "@react-three/fiber"' : ''}
        import { useGLTF, ${hasInstances ? 'Merged, ' : ''} ${
          scene.includes('PerspectiveCamera') ? 'PerspectiveCamera,' : ''
        }
        ${scene.includes('OrthographicCamera') ? 'OrthographicCamera,' : ''}
        ${hasAnimations ? 'useAnimations' : ''} } from '@react-three/drei'
        ${
          hasPrimitives || options.types
            ? `import { ${options.types ? 'GLTF,' : ''} ${hasPrimitives ? 'SkeletonUtils' : ''} } from "three-stdlib"`
            : ''
        }
        ${options.types ? printTypes(objects, animations) : ''}

        ${
          hasInstances
            ? `
        const context = React.createContext(${options.types ? '{} as ContextType' : ''})

        export function Instances({ children, ${slotParams}...props }${options.types ? ': JSX.IntrinsicElements["group"]' : ''}) {
          const { nodes } = useGLTF('${url}'${options.draco ? `, ${JSON.stringify(options.draco)}` : ''})${
            options.types ? ' as GLTFResult' : ''
          }
          const instances = React.useMemo(() => ({
            ${Object.values(duplicates.geometries)
              .map((v) => `${v.name}: ${v.node}`)
              .join(', ')}
          }), [nodes])
          return (
            <Merged meshes={instances} {...props}>
              {(instances${
                options.types ? ': ContextType' : ''
              }) => <context.Provider value={instances} children={children} />}
            </Merged>
          )
        }
        `
            : ''
        }

        export ${options.exportdefault ? 'default' : ''} function Model({ ${slotParams}...props }${
          options.types ? ": JSX.IntrinsicElements['group']" : ''
        }) {
          ${hasInstances ? 'const instances = React.useContext(context);' : ''} ${
            hasAnimations ? `const group = ${options.types ? 'React.useRef<THREE.Group>()' : 'React.useRef()'};` : ''
          } ${
            !options.instanceall
              ? `const { ${!hasPrimitives ? `nodes, materials` : 'scene'} ${hasAnimations ? ', animations' : ''}} = useGLTF('${url}'${
                  options.draco ? `, ${JSON.stringify(options.draco)}` : ''
                })${!hasPrimitives && options.types ? ' as GLTFResult' : ''}${
                  hasPrimitives
                    ? `\nconst clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
                const { nodes, materials } = useGraph(clone) ${options.types ? ' as GLTFResult' : ''}`
                    : ''
                }`
              : ''
          } ${printAnimations(animations)}
          return (
            <group ${hasAnimations ? `ref={group}` : ''} {...props} dispose={null}>
        ${scene}
            </group>
          )
        }

useGLTF.preload('${url}')`

  if (!options.console) console.log(header)
  const output = header + '\n' + result
  const formatted = prettier.format(output, {
    semi: false,
    printWidth: options.printwidth || 1000,
    singleQuote: true,
    jsxBracketSameLine: true,
    parser: 'babel-ts',
    plugins: [babelParser],
  })
  return formatted
}

export default parse
