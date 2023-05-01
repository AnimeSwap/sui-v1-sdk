import { Decimal } from '../main'

export type AdminData = {
  dao_fee_to: string
  admin_address: string
  dao_fee: string
  swap_fee: string
  dao_fee_on: boolean
  is_pause: boolean
}

export type PairInfo = Array<{
  type: string
  fields: {
    coin_x: string
    coin_y: string
  }
}>

export type LiquidityPool = {
  coin_x_reserve: string
  coin_y_reserve: string
  k_last: string
  last_block_timestamp: string
  last_price_x_cumulative: string
  last_price_y_cumulative: string
  locked: boolean
  lp_coin_reserve: string
  lp_supply: {
    type: string
    fields: {
      value: string
    }
  }
}

export type CoinPair = {
  coinX: string
  coinY: string
}

export type PairList = Array<CoinPair>

export type Route = Array<CoinPair>

export type Routes = Array<Route>

export type LiquidityPoolResource = {
  coinX: string
  coinY: string
  coinXReserve: string
  coinYReserve: string
}

export type Trade = {
  coinPairList: Array<LiquidityPoolResource> // coin pair info with reserve amount
  amountList: Array<Decimal>  // coin amount, from `fromCoin` to `toCoin`
  coinTypeList: Array<string>  // coin type, from `fromCoin` to `toCoin`
  priceImpact: Decimal  // price impact of this trade
}

export type AddLiquidityParams = {
  coinX: string
  coinY: string
  amount: Decimal
  fixedCoin: 'X' | 'Y'
}

export type AddLiquidityReturn = {
  amount: Decimal
  coinXDivCoinY: Decimal
  coinYDivCoinX: Decimal
  shareOfPool: Decimal
}

export type RemoveLiquidityParams = {
  coinX: string
  coinY: string
  amount: Decimal
}

export type RemoveLiquidityReturn = {
  amountX: Decimal
  amountY: Decimal
}

export type LPCoinResource = {
  coinX: string
  coinY: string
  lpCoin: string
  value: Decimal
}
