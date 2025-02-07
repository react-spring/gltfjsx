/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Object3D } from 'three'

import { Logger } from './options.js'

export interface Options {
  silent: boolean
  debug: boolean
}

export class Log implements Logger {
  private options: Options
  constructor(options: Options) {
    this.options = options
  }

  public isDebugEnabled() {
    return this.options.debug && !this.options.silent
  }

  public debug(...args: any[]) {
    if (this.isDebugEnabled()) {
      this.writeLog('debug', ...args)
    }
  }

  public info(...args: any[]) {
    if (!this.options.silent) {
      this.writeLog('info', ...args)
    }
  }

  public error(...args: any[]) {
    this.writeLog('error', ...args)
  }

  private writeLog(level: string, ...args: any[]) {
    console.log(`${level}: `, ...args)
  }
}

export const descObj3D = (o: Object3D) => {
  const { type, name, uuid } = o
  return `${type} ${name} ${uuid}`
}
