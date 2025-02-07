import fs from 'node:fs'
import path, { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { readPackageUpSync } from 'read-pkg-up'

import { CliOptions } from '../options.js'

const thisDirName = dirname(fileURLToPath(import.meta.url))

export function getFileSize(file: string) {
  function roundOff(value: number) {
    return Math.round(value * 100) / 100
  }

  const stats = fs.statSync(file)
  const fileSize = stats.size
  const fileSizeKB = roundOff(fileSize * 0.001)
  const fileSizeMB = roundOff(fileSizeKB * 0.001)
  return {
    size: fileSizeKB > 1000 ? `${fileSizeMB}MB` : `${fileSizeKB}KB`,
    sizeKB: fileSizeKB,
  }
}

export function compareFileSizes(original: string, transformed: string) {
  const { size: sizeOriginal, sizeKB: sizeKBOriginal } = getFileSize(original)
  const { size: sizeTransformed, sizeKB: sizeKBTransformed } = getFileSize(transformed)
  return `${original} [${sizeOriginal}] > ${transformed} [${sizeTransformed}] (${Math.round(
    100 - (sizeKBTransformed / sizeKBOriginal) * 100,
  )}%)`
}

// FIXME This really needs a unit test
export function resolveModelLoadPath(file: string, root?: string) {
  const filePath = path.resolve(file)
  const rootPath = root ? path.resolve(root) : path.dirname(file)
  const relativePath = path.relative(rootPath, filePath) || ''
  if (process.platform === 'win32') return relativePath.replace(/\\/g, '/')
  return relativePath
}

export function readFileToArrayBuffer(filename: string) {
  function toArrayBuffer(buf: Buffer) {
    const ab = new ArrayBuffer(buf.length)
    const view = new Uint8Array(ab)
    for (let i = 0; i < buf.length; ++i) view[i] = buf[i]
    return ab
  }
  const modelFileData = fs.readFileSync(filename)
  const arrayBuffer = toArrayBuffer(modelFileData)
  return arrayBuffer
}

export function resolveOutputSrcFile(cliOptions: CliOptions) {
  const outputSrcExt = cliOptions.types ? '.tsx' : '.jsx'
  let outputSrcFile: string
  if (!cliOptions.output) {
    outputSrcFile = path.resolve(`Model.${outputSrcExt}`, 'foo') // based on cwd
  } else {
    outputSrcFile = path.resolve(cliOptions.output)
  }
  return outputSrcFile
}

/**
 *  upper case first letter of the component name
 */
export function resolveComponentName(outputSrcFile: string) {
  let componentName = path.parse(outputSrcFile).name
  componentName = componentName.charAt(0).toUpperCase() + componentName.slice(1)
  return componentName
}

export function readPackage() {
  const packageResult = readPackageUpSync({ cwd: thisDirName, normalize: false })
  if (!packageResult) {
    throw new Error(`No package.json found at or above ${thisDirName}`)
  }
  return packageResult
}
