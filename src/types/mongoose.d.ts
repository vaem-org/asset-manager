declare module 'mongoose' {
  interface Schema {
    searchPaths?: string[]
    searchExact?: boolean
  }
}
