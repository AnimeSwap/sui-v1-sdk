const HEX_REGEXP = /^[-+]?[0-9A-Fa-f]+\.?[0-9A-Fa-f]*?$/

export function addHexPrefix(hex: string): string {
  return !hex.startsWith('0x') ? '0x' + hex : hex
}

export function shortString(str: string, start = 4, end = 4) {
  const slen = Math.max(start, 1)
  const elen = Math.max(end, 1)
  return str.slice(0, slen + 2) + ' ... ' + str.slice(-elen)
}

export function shortAddress(address: string, start = 4, end = 4) {
  return shortString(addHexPrefix(address), start, end)
}

export function checkAddress(
  address: string,
  options: { leadingZero: boolean } = { leadingZero: true }
): boolean {
  let str = address
  if (options.leadingZero) {
    if (!address.startsWith('0x')) {
      return false
    } else {
      str = str.substring(2)
    }
  }
  return HEX_REGEXP.test(str)
}

/**
 * Attempts to turn a value into a `Buffer`. As input it supports `Buffer`, `String`, `Number`, null/undefined, `BN` and other objects with a `toArray()` method.
 * @param v the value
 */
// eslint-disable-next-line
export function toBuffer(v: any): Buffer {
  if (!Buffer.isBuffer(v)) {
    if (Array.isArray(v)) {
      v = Buffer.from(v)
    } else if (typeof v === 'string') {
      if (exports.isHexString(v)) {
        v = Buffer.from(exports.padToEven(exports.stripHexPrefix(v)), 'hex')
      } else {
        v = Buffer.from(v)
      }
    } else if (typeof v === 'number') {
      v = exports.intToBuffer(v)
    } else if (v === null || v === undefined) {
      v = Buffer.allocUnsafe(0)
    } else if (v.toArray) {
      // converts a BN to a Buffer
      v = Buffer.from(v.toArray())
    } else {
      throw new Error('invalid type')
    }
  }
  return v
}

export function bufferToHex(buffer: Buffer): string {
  return addHexPrefix(toBuffer(buffer).toString('hex'))
}

export function hexToString(str: string) {
  // remove additional 0x prefix
  if (str.startsWith('0x')) {
    str = str.substring(2)
  }
  const buf = Buffer.from(str, 'hex')
  return buf.toString('utf8')
}

export function hexRemovePrefix(hex: string) {
  return hex.startsWith('0x') ? hex.substring(2) : hex
}

// left padding '0's. hex must be '.+::.+::.+'
// for example: 0x2::sui::SUI -> 0x0000000000000000000000000000000000000002::sui::SUI
export function hexLeftPadding(hex: string, length = 64) {
  const noPrefix = hexRemovePrefix(hex)
  const hexArr = noPrefix.split(/:(.*)/s)
  const first = hexArr[0]
  const last = hexArr[1] ? `:${hexArr[1]}` : ''
  return `0x${first.padStart(length, '0')}${last}`
}

export function hexStringToUint8Array(hexString: string) {
  if (hexString.length % 2 !== 0){
    throw 'Invalid hexString'
  }
  const arrayBuffer = new Uint8Array(hexString.length / 2)

  for (let i = 0; i < hexString.length; i += 2) {
    const byteValue = parseInt(hexString.substring(i, i + 2), 16)
    if (isNaN(byteValue)){
      throw 'Invalid hexString'
    }
    arrayBuffer[i/2] = byteValue
  }

  return arrayBuffer
}
