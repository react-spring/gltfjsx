export type Props = Record<string, any>

/**
 * type UserWithName = WithRequired<User, 'name'>
 *
 * @see https://stackoverflow.com/a/69328045/2363935
 */
// export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type WithRequired<T, K extends keyof T> = T & Required<Pick<T, K>>

/**
 * type UserWithOptionalName = WithOptional<User, 'name'>
 *
 * @see https://stackoverflow.com/a/69328045/2363935
 */
export type WithOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/**
 * Same as `keyof` but only returns strings
 *
 * @see https://stackoverflow.com/a/65420892/2363935
 */
export type StringKeyOf<T> = Extract<keyof T, string>
