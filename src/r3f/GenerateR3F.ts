import * as prettier from 'prettier'
import babelParser from 'prettier/parser-babel.js'
import { Bone, Mesh, Object3D } from 'three'
import {
  FunctionDeclaration,
  InterfaceDeclaration,
  JsxElement,
  Project,
  ScriptTarget,
  SourceFile,
  SyntaxKind,
} from 'ts-morph'

import { AnalyzedGLTF } from '../analyze/AnalyzedGLTF.js'
import { isBone, isRemoved, isTargetedLight } from '../analyze/is.js'
import isVarName from '../analyze/isVarName.js'
import { nodeName } from '../analyze/utils.js'
import { GenerateOptions } from '../options.js'
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
export class GeneratedR3F<O extends GenerateOptions = GenerateOptions> {
  protected project: Project
  protected src: SourceFile
  protected gltfInterface!: InterfaceDeclaration
  protected propsInterface!: InterfaceDeclaration
  protected instancesFn: FunctionDeclaration
  protected fn!: FunctionDeclaration
  protected groupRoot!: JsxElement

  constructor(
    private a: AnalyzedGLTF,
    private options: Readonly<O>,
  ) {
    this.project = new Project({
      useInMemoryFileSystem: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      compilerOptions: {
        target: ScriptTarget.ESNext,
        jsx: 1, // JsxEmit.Preserve bug https://github.com/dsherret/ts-morph/issues/1605
      } as any,
    })
    this.src = this.project.createSourceFile(`${options.componentName}.tsx`, this.getTemplate())

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

    this.setModelGLTFTypes()

    this.generateChildren()

    // basic ts format after manipulation - see toTsx() and toJsx() for better formatting
    this.src.formatText()
  }

  public getSrc() {
    return this.src
  }

  /**
   * @returns the source as tsx
   */
  public async toTsx() {
    return this.formatCode(this.src.getFullText())
  }

  /**
   * @returns the source as jsx
   */
  public async toJsx() {
    // npx tsc --jsx preserve -t esnext --outDir js --noEmit false
    const result = this.project.emitToMemory()
    return this.formatCode(result.getFiles()[0].text)
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
  protected setModelGLTFTypes() {
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

  protected writeProps(o: Object3D) {
    const props = this.a.calculateProps(o)
    return Object.keys(props)
      .map((key: string) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const value = props[key]

        if (stringProps.includes(key)) {
          return `${key}="${value}"`
        }
        if (value === true) {
          return key // e.g. castShadow
        }
        return `${key}={${value}}`
      })
      .join(' ')
  }

  protected async formatCode(code: string) {
    return prettier.format(code, this.getPrettierSettings())
  }

  protected getPrettierSettings() {
    return {
      semi: false,
      printWidth: 100,
      singleQuote: true,
      jsxBracketSameLine: true,
      parser: 'babel-ts',
      plugins: [babelParser],
    }
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
  protected getTemplate() {
    const { componentName, exportdefault, header, size } = this.options
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

  /** convenience */
  private getInterface(name: string) {
    const i = this.src.getInterface(name)
    if (!i) throw new Error(`${name} interface not found`)
    return i
  }
}
