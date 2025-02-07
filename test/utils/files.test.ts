import { describe, expect, it } from 'vitest'

import { resolveComponentName } from '../../src/index.js'

describe('utils/files', () => {
  for (const ext of ['tsx', 'jsx']) {
    it(`should resolveComponentName for ${ext}`, () => {
      expect(resolveComponentName(`/Users/foo/bar/Baz.${ext}`)).toBe('Baz')
    })
  }
})
