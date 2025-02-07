import { Bone, Mesh, Object3D } from 'three'
import { FunctionDeclaration, InterfaceDeclaration, JsxElement, SyntaxKind } from 'ts-morph'

import { AbstractGenerate } from '../AbstractGenerate.js'
import { AnalyzedGLTF } from '../analyze/AnalyzedGLTF.js'
import { isBone, isRemoved, isTargetedLight } from '../analyze/is.js'
import isVarName from '../analyze/isVarName.js'
import { nodeName } from '../analyze/utils.js'
import { GenerateOptions } from '../options.js'
import { Props } from '../utils/types.js'
import { getJsxElementName, isPrimitive } from './utils.js'

// controls writing of prop values in writeProps()
const stringProps = ['name']

/**
 * Generate React Three Fiber component
 *
 * This uses a mix of a string template, and ts-morph to generate the source file.  Protected member functions
 * are used to manipulate the source file and allow for extensibiilty/customization.  Customization of the
 * ts-morph {SourceFile} can also be done externally as opposed or in conjunction with extending this class.
 *
 * Much was converted to use stringified template for simplicity, but blocks can be moved out to ts-morph
 * as needed.  String writer/setBodyText is easier to read, so where it made sense, it was used.
 *
 * @see https://ts-ast-viewer.com to help navigate/understand the AST
 */
export class GenerateR3F<O extends GenerateOptions = GenerateOptions> extends AbstractGenerate {
  // leave public to allow for external manipulation - in case the user does not want to subclass
  public gltfInterface!: InterfaceDeclaration
  public propsInterface!: InterfaceDeclaration
  public instancesFn: FunctionDeclaration
  public fn!: FunctionDeclaration
  public groupRoot!: JsxElement
  protected exposedPropsEncountered = new Set<keyof O['exposeProps']>()

  constructor(
    protected a: AnalyzedGLTF,
    protected options: Readonly<O>,
  ) {
    super()
    this.src = this.project.createSourceFile(
      `${this.options.componentName}.tsx`,
      this.getTemplate(),
    )

    // gather references before we rename them
    this.gltfInterface = this.getInterface(this.getModelGLTFName())
    this.propsInterface = this.getInterface(this.getModelPropsName())

    const fn = this.src.getFunction(this.options.componentName)
    if (!fn) throw new Error('Model function not found')
    this.fn = fn

    const fnReturn = this.fn.getStatementByKind(SyntaxKind.ReturnStatement)
    if (!fnReturn) throw new Error('Model function return not found')
    const groupRoot = fnReturn.getFirstDescendantByKindOrThrow(SyntaxKind.JsxElement)
    if (!groupRoot) throw new Error('Model function groupRoot not found')
    this.groupRoot = groupRoot

    // may or may not exist
    this.instancesFn = this.src.getFunction(this.getModelInstancesName())!

    // set constants - load path, draco
    this.setConstants()

    this.setGLTFInterfaceTypes()

    this.generateChildren()

    this.exposeProps()

    // basic ts format after manipulation - see toTsx() and toJsx() for better formatting
    this.src.formatText()
  }

  protected setConstants() {
    const { draco, modelLoadPath: inModelLoadPath } = this.options
    const modelLoadPath =
      (inModelLoadPath.toLowerCase().startsWith('http') ? '' : '/') + inModelLoadPath
    this.src.getVariableDeclaration('modelLoadPath')?.setInitializer(`'${modelLoadPath}'`)
    this.src.getVariableDeclaration('draco')?.setInitializer(draco ? 'true' : 'false')
  }

  /**
   * Set the types for the GLTF model
   *
   * e.g.
   *   interface FlightHelmetGLTF extends GLTF {
   *     nodes: {
   *       GlassPlastic_low: Mesh
   *     }
   *     materials: {
   *       GlassPlasticMat: MeshStandardMaterial
   *     }
   *   }
   */
  protected setGLTFInterfaceTypes() {
    // nodes
    const meshes: Mesh[] = this.a.getMeshes()
    const bones: Bone[] = this.a.getBones()
    const nodes = this.gltfInterface.getProperty('nodes')
    if (!nodes) throw new Error('gltfInterface nodes not found')
    nodes.setType(
      `{ ${[...meshes, ...bones].map(({ name, type }) => (isVarName(name) ? name : `['${name}']`) + ': ' + type).join(', ')} }`,
    )

    // materials
    const materials = this.gltfInterface.getProperty('materials')
    if (!materials) throw new Error('gltfInterface materials not found')
    materials.setType(
      `{ ${this.a
        .getMaterials()
        .map(({ name, type }) => (isVarName(name) ? name : `['${name}']`) + ': ' + type)
        .join(', ')} }`,
    )

    // animations (done in the template)
  }

  /**
   * Generate the children of the root <group> found in the template
   */
  protected generateChildren() {
    this.groupRoot.setBodyText(
      this.a.gltf.scene.children.map((child) => this.generate(child)).join('\n'),
    )
  }

  /**
   * Generate the JSX for the object and its children
   */
  protected generate(o: Object3D): string {
    const { bones } = this.options
    const node = nodeName(o)
    const element = getJsxElementName(o, this.a) // used except when instanced
    let result = ''
    let children = ''

    // Children
    if (o.children) o.children.forEach((child) => (children += this.generate(child)))

    // Bail out if the object was pruned
    if (isRemoved(o)) return children

    // Bone and options.bone is false - return
    if (!bones && isBone(o)) {
      return `<${element} object={${node}} />`
    }

    // Lights with targets - return
    if (isTargetedLight(o)) {
      return `<${element} ${this.writeProps(o)}>
            <primitive object={${node}.target} ${this.writeProps(o.target)} />
          </${element}>`
    }

    // Open the element
    result = `<${element} `

    // Bone and options.bones is true
    if (isBone(o)) result += `object={${node}} `

    result += this.writeProps(o)

    if (children.length) {
      // Add children and close the element's tag
      result += `>
      ${children}
      </${element}>`
    } else {
      // Close this element's tag
      result += `/>`
    }
    return result
  }

  /**
   * - Add all mapped props to the ModelProps interface
   * - Destructure variables in the function body with a ...rest
   * - Change the identifer on the root <group {...rest} /> element
   * - Set the argument in the function signature
   */
  protected exposeProps() {
    if (this.exposedPropsEncountered.size === 0) return

    // add all mapped props to the ModelProps interface
    for (const prop of this.exposedPropsEncountered) {
      const { to, matcher, structure } = this.options.exposeProps![prop]
      const pv = { ...structure, name: prop as string }

      // update the props interface
      this.propsInterface.addProperty(pv)
    }

    // change the identifier on the group JsxSpreadAttribute (causes rename of all usages)
    const spreadIdentifier = this.groupRoot
      .getOpeningElement()
      .getAttributes()
      .find((a) => a.getKind() === SyntaxKind.JsxSpreadAttribute)
      ?.getFirstChildByKind(SyntaxKind.Identifier)
    spreadIdentifier?.rename('rest') // this will rename usages, so we need to set he fn arg name last

    // (last) rename the argument in the function signature (without renaming all usages)
    this.fn.getParameters()[0].set({ name: 'props' })

    // destructure the props variable in the function body with a ...rest.  Add this after `useGLTF()` call
    this.fn.insertStatements(
      1,
      `const { ${[...this.exposedPropsEncountered].join(', ')}, ...rest } = props`,
    )
  }

  /**
   * Iterate over all exposeProps and return the component prop name if it matches.
   * @param o
   * @param to the Object3D property name
   * @returns the component prop name if it matches
   */
  protected getMappedComponentProp(
    o: Object3D,
    to: string,
  ): keyof GenerateOptions['exposeProps'] | undefined {
    const { exposeProps } = this.options
    if (!exposeProps) return

    for (const [componentProp, mappedProp] of Object.entries(exposeProps)) {
      if (
        mappedProp.to.includes(to) &&
        (mappedProp.matcher === undefined || mappedProp?.matcher(o, this.a))
      ) {
        return componentProp as keyof GenerateOptions['exposeProps']
      }
    }

    return
  }

  /**
   * Determine and write the props as a string
   */
  protected writeProps(o: Object3D): string {
    const { log } = this.options
    const props = this.determineProps(o)

    const propString = Object.keys(props)
      .map((key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        let value = props[key]
        const componentProp = this.getMappedComponentProp(o, key)
        if (componentProp) {
          log.debug(
            `Propagating ${key}={${componentProp}} on <${getJsxElementName(o, this.a)} name='${o.name}'/>`,
          )
          value = componentProp
          this.exposedPropsEncountered.add(componentProp)
        }

        if (stringProps.includes(key)) {
          return `${key}="${value}"`
        }
        if (value === true) {
          return key // e.g. castShadow
        }
        return `${key}={${value}}`
      })
      .join(' ')

    return propString
  }

  /**
   * Determine the props for the Object3D, including exposed component props.  Leave as protected
   *  method allowing for easy customization in subclasses.
   */
  protected determineProps(o: Object3D): Props {
    const { exposeProps, log } = this.options
    const props = this.a.calculateProps(o)
    const propKeys = Object.keys(props)

    // find explicit matches from exposeProps matchers and add to calculated props
    // e.g. propagate visible=true where it is defaulted true.
    if (exposeProps) {
      for (const [componentProp, mappedProp] of Object.entries(exposeProps)) {
        if (
          mappedProp.matcher &&
          mappedProp.matcher(o, this.a) &&
          !propKeys.includes(componentProp)
        ) {
          let toArray = mappedProp.to
          if (!Array.isArray(mappedProp.to)) {
            toArray = [mappedProp.to]
          }
          for (const to of toArray) {
            log.debug(`Forcing propagation of ${to}={${componentProp}} name='${o.name}'`)
            // fabricate a value to be remapped
            props[to] = 'foobarbaz'
          }
        }
      }
    }
    return props
  }

  protected getModelPropsName() {
    return this.options.componentName + 'Props'
  }

  protected getModelActionName() {
    return this.options.componentName + 'Action'
  }

  protected getModelGLTFName() {
    return this.options.componentName + 'GLTF'
  }

  protected getModelInstancesName() {
    return this.options.componentName + 'Instances'
  }

  protected hasPrimitives() {
    return this.a.includes(isPrimitive)
  }

  /**
   * Provides the template for the generated source file.
   *
   * NOTE: for simplicity, opted to just include all potential imports or destructured variables, let eslint sort out unused in userland
   *
   * @returns
   */
  protected getTemplate(): string {
    const { componentName, exportDefault: exportdefault, header, size } = this.options
    const modelGLTFName = this.getModelGLTFName()
    const modelActionName = this.getModelActionName()
    const modelPropsName = this.getModelPropsName()
    const modelInstancesName = this.getModelInstancesName()
    const hasAnimations = this.a.hasAnimations()
    const hasInstances = this.a.hasInstances()
    const dupGeometryValues = this.a.getDuplicateGeometryValues()
    const hasPrimitives = this.hasPrimitives() // bones, lights
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const extras = this.a.gltf.parser.json.asset && this.a.gltf.parser.json.asset.extras

    // NOTE: for simplicity, opted to just include all potential imports, let eslint sort out unused in userland
    const template = `
      /*
        ${header ? header : 'Auto-generated'} ${size ? `\nFiles: ${size}` : ''}
      */
      ${
        extras
          ? Object.keys(extras as Record<string, any>)
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              .map((key) => `${key.charAt(0).toUpperCase() + key.slice(1)}: ${extras[key]}`)
              .join('\n')
          : ''
      }
      import { useAnimations, useGLTF, Merged, PerspectiveCamera, OrthographicCamera } from '@react-three/drei'
      import { GroupProps, MeshProps, useGraph } from '@react-three/fiber'
      import * as React from 'react'
      import { AnimationClip, Mesh, MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
      import { GLTF, SkeletonUtils } from 'three-stdlib'

      ${
        hasAnimations
          ? `
        type ${modelActionName}Names = ${this.a.gltf.animations.map((clip, i) => `'${clip.name}'`).join(' | ')}
        interface ${modelActionName} extends AnimationClip { name: ${modelActionName}Names }
        `
          : ''
      }

      interface ${modelGLTFName} extends GLTF {
        nodes: {}
        materials: {}
        ${hasAnimations ? `animations: ${modelActionName}[]` : ''}
      }

      export interface ${modelPropsName} extends GroupProps {}

      const modelLoadPath = '<foo>.glb'
      const draco = false

      ${
        hasInstances
          ? `
      type ContextType = Record<string, React.ForwardRefExoticComponent<MeshProps>>

      const context = React.createContext<ContextType>({})

      export ${exportdefault ? 'default' : ''} function ${modelInstancesName}({ children, ...props }: ${modelPropsName}) {
        const { nodes } = useGLTF(modelLoadPath, draco) as ${modelGLTFName}
        const instances = React.useMemo(() => ({
          ${dupGeometryValues.map((v) => `${v.name}: ${v.node}`).join(', ')}
        }), [nodes])
        return (
          <Merged meshes={instances} {...props}>
            {(instances: ContextType) => <context.Provider value={instances} children={children} />}
          </Merged>
        )
      }        
      `
          : ''
      }

      export function ${componentName}(props: ${modelPropsName}) {
        ${
          hasInstances
            ? 'const instances = React.useContext(context)'
            : hasPrimitives
              ? `
                const { ${hasAnimations ? 'animations, ' : ''}scene } = useGLTF(modelLoadPath, draco) as ${modelGLTFName}
                const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
                const { nodes, materials } = useGraph(clone) as ${modelGLTFName}
              `
              : `const { ${hasAnimations ? 'animations, ' : ''}nodes, materials } = useGLTF(modelLoadPath, draco) as ${modelGLTFName}`
        }
        ${
          hasAnimations
            ? `
          const groupRef = React.useRef<Group>()
          const { actions } = useAnimations(animations, groupRef)
          `
            : ''
        }
        return (
          <group ${hasAnimations ? `ref={groupRef}` : ''} {...props} dispose={null}>
          </group>
        )
      }

      useGLTF.preload(modelLoadPath, draco)
      `
    return template
  }
}
