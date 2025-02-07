import * as prettier from 'prettier'
import babelParser from 'prettier/parser-babel.js'
import { Project, ScriptTarget, SourceFile, ts } from 'ts-morph'

/**
 * Abstract class for a code generator.
 *
 * @see https://ts-ast-viewer.com to help navigate/understand the AST
 */
export abstract class AbstractGenerate {
  // leave public to allow for external manipulation - in case the user does not want to subclass
  public project: Project
  /** subclass must assign */
  public src!: SourceFile

  /**
   *
   * @param options
   */
  constructor() {
    this.project = new Project({
      useInMemoryFileSystem: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      compilerOptions: {
        target: ScriptTarget.ESNext,
        jsx: ts.JsxEmit.Preserve,
      } as any,
    })
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

  /** convenience */
  protected getInterface(name: string) {
    const i = this.src.getInterface(name)
    if (!i) throw new Error(`${name} interface not found`)
    return i
  }
}
