import { describe, expect, it } from 'vitest'

import { shallowEqual } from '../../src/index.js'

describe('shallowEqual', () => {
  it('should work', () => {
    const obj1 = { name: 'John', age: 33 }
    const obj2 = { age: 33, name: 'John' }
    const obj3 = { name: 'John', age: 45 }

    const aobj1 = { name: 'John', age: 33, kids: ['booker', 'archer'] }
    const aobj2 = { age: 33, kids: ['archer', 'booker'], name: 'John' }
    const aobj3 = { name: 'John', age: 33, kids: ['bookerx', 'archerx'] }

    expect(shallowEqual(obj1, obj2)).toBe(true)
    expect(shallowEqual(obj1, obj3)).toBe(false)

    expect(shallowEqual(aobj1, aobj2)).toBe(true)
    expect(shallowEqual(aobj1, aobj3)).toBe(false)
  })
})
