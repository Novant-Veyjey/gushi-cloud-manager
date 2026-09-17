/** qrcode-generator 没有自带类型声明，这里补一份最小可用声明 */
declare module 'qrcode-generator' {
  interface QRCodeInstance {
    addData(data: string): void
    make(): void
    createDataURL(cellSize?: number, margin?: number): string
    createImgTag(cellSize?: number, margin?: number, alt?: string): string
    createSvgTag(cellSize?: number, margin?: number): string
  }

  function qrcode(
    typeNumber: number | string,
    errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H'
  ): QRCodeInstance

  export = qrcode
}
