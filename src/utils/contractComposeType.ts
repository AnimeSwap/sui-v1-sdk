import { composeType } from './contract'
import { hexLeftPadding, hexRemovePrefix } from './hex'

const LPCoin = 'LPCoin'
const ANIMESWAP = 'animeswap'

export function composeLPCoin(packageName: string, moduleName: string, coinX: string, coinY: string) {
  return composeType(packageName, moduleName, LPCoin, [coinX, coinY])
}

export function composeLPCoinType(address: string) {
  return composeType(address, ANIMESWAP, LPCoin)
}

export function composeLiquidityPoolName(packageName: string, moduleName: string, coinX: string, coinY: string) {
  return composeType(hexRemovePrefix(packageName), moduleName, `${LPCoin}<${hexRemovePrefix(hexLeftPadding(coinX))},${hexRemovePrefix(hexLeftPadding(coinY))}>`)
}
