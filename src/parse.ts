import { parse as babelParse } from '@babel/parser'

const parse = (source: string, dts = false) => {
  const ast = babelParse(source, {
    sourceType: 'module',
    allowAwaitOutsideFunction: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    plugins: ['jsx', ['importAttributes', { deprecatedAssertSyntax: true }], ['typescript', { dts }]],
  })

  return ast
}

export { parse }
