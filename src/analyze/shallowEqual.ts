import { Props } from '../utils/types.js'

const compareArrays = (ia1: any[], ia2: any[]) => {
  if (ia1.length !== ia2.length) {
    return false
  }

  const a1 = ia1.sort()
  const a2 = ia2.sort()

  const result = a1.every((value, index) => a2[index] == value)
  // console.log("compareArrays sorted", a1, " == ", a2, ": ", result);
  return result
}

/**
 * Performs equality by iterating through keys on an object and returning false
 * when any key has values which are not equal between the arguments.  If
 * the values are arrays, it will sort and compare them for equality.
 */
export function shallowEqual(o1: Props, o2: Props): boolean {
  return (
    Object.keys(o1).length === Object.keys(o2).length &&
    Object.keys(o1).every((p) => {
      if (Array.isArray(o1[p]) && Array.isArray(o2[p])) {
        const result = compareArrays(o1[p], o2[p])
        // console.log("isArray", o1[p], " == ", o2[p], ": ", result);
        return result
      } else {
        return o1[p] === o2[p]
      }
    })
  )
}
