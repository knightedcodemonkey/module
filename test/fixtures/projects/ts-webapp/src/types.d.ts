declare namespace JSX {
  type Element = any
  interface IntrinsicElements {
    [elemName: string]: any
  }
}

declare module 'react/jsx-runtime' {
  export const jsx: any
  export const jsxs: any
  export const Fragment: any
}

declare module 'react/jsx-dev-runtime' {
  export const jsxDEV: any
  export const Fragment: any
}
