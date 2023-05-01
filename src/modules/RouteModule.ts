import { TransactionBlock } from '@mysten/sui.js'
import { IModule } from '../interfaces/IModule'
import { Decimal } from '../main'
import { SDK } from '../sdk'
import { BigNumber } from '../types/common'
import { Payload } from '../types/sui'
import { CoinPair, LiquidityPoolResource, PairList, Route, Routes, Trade } from '../types/swap'
import { isCoinEqual } from '../utils/contract'
import { d, getRandomInt } from '../utils/number'
import { getCoinInWithFees, getCoinOutWithFees, withSlippage } from './SwapModule'

const DEFAULT_ROUTE = 5
const U64MAX: Decimal = d('18446744073709551615') // 2^64-1
const fee = d(30)
export type CoinPair2LiquidityPoolResource = { [key: string]: LiquidityPoolResource } // key of coinType X,Y is: `X, Y`

export type SwapCoinPayload = {
  address: string
  trade: Trade
  slippage: BigNumber
}

export class RouteModule implements IModule {
  protected _sdk: SDK

  get sdk() {
    return this._sdk
  }

  constructor(sdk: SDK) {
    this._sdk = sdk
  }

  /**
   * Find all routes from one coin to another
   * @param pairList 
   * @param coinTypeOutOrigin toCoin
   * @param hops 
   * @param currentPairs
   * @param currentCoinType current fromCoin
   * @param routes current routes
   * @returns all routes from fromCoin to toCoin
   */
  findAllRoutes(
    pairList: PairList,
    coinTypeOutOrigin: string,
    hops: number,
    currentPairs: Array<CoinPair>,
    currentCoinType: string,
    routes: Routes
  ): Routes {
    for (let i = 0; i < pairList.length; i++) {
      const pair = pairList[i]
      if (!(isCoinEqual(pair.coinX, currentCoinType)) && !(isCoinEqual(pair.coinY, currentCoinType))) continue
      const coinTypeOut = (isCoinEqual(pair.coinX, currentCoinType))
        ? pair.coinY
        : pair.coinX
      if (isCoinEqual(coinTypeOut, coinTypeOutOrigin)) {
        // find route
        routes.push([...currentPairs, pair])
      } else if (hops > 1 && pairList.length > 1) {
        const pairListExcludingThisPair = pairList.slice(0, i).concat(pairList.slice(i + 1, pairList.length))
        this.findAllRoutes(
          pairListExcludingThisPair,
          coinTypeOutOrigin,
          hops - 1,
          [...currentPairs, pair],
          coinTypeOut,
          routes
        )
      }
    }
    return routes
  }


  /**
   * Get all routes from `fromCoin` to `toCoin`
   * @param pairList all pair list, get this from `swap.getLiquidityPools()`
   * @param fromCoin 
   * @param toCoin 
   * @returns Array<Route>
   */
  async getAllRoutes(fromCoin: string, toCoin: string, maxHop = 2): Promise<Routes> {
    const lpData = await this.sdk.swap.getLiquidityPools()
    const allPairs = lpData.pairList
    return this.findAllRoutes(
      allPairs,
      toCoin,
      maxHop,
      [],
      fromCoin,
      []
    )
  }

  /**
   * Get candiate routes. Because of request rate limit, only part of routes will be request.
   * @param allRouteList 
   * @param currentBestTrade (optional) The current best Trade. The result will include this Trade coinPair
   * @param currentSecondBestTrade (optional) The current second best Trade. The result will include this Trade coinPair
   * @param maxRoutes only return `maxRoutes` items. default: 5
   */
  getCandidateRoutes(allRouteList: Array<Route>, currentBestTrade?: Trade, currentSecondBestTrade?: Trade, maxRoutes = 5): Array<Route> {
    if (allRouteList.length <= maxRoutes) {
      return allRouteList
    }

    const candidateRouteList: Array<Route> = []
    let randomIndexList: Array<number> = []
    let bestRoute
    let secondBestRoute
    if (currentBestTrade) {
      bestRoute = trade2Route(currentBestTrade)
    }
    if (currentSecondBestTrade) {
      secondBestRoute = trade2Route(currentSecondBestTrade)
    }
    for (let i = 0; i < allRouteList.length; i++) {
      const route = allRouteList[i]
      if (route.length == 1) {
        randomIndexList.push(i)
      } else if (bestRoute && isRouteEqual(bestRoute, route)) {
        randomIndexList.push(i)
      } else if (secondBestRoute && isRouteEqual(secondBestRoute, route)) {
        randomIndexList.push(i)
      }
    }
    randomIndexList = randomIndexList.concat(getRandomIndexFromArray(allRouteList, maxRoutes))
    randomIndexList = removeDup(randomIndexList)
    randomIndexList = randomIndexList.slice(0, maxRoutes)
    for (let i = 0; i < randomIndexList.length; i++) {
      candidateRouteList.push(allRouteList[randomIndexList[i]])
    }
    return candidateRouteList
  }

  /**
   * Get all LPCoin resource from candidate routes.
   * @param candidateRouteList 
   * @returns CoinPair2LiquidityPoolResource
   */
  async getAllCandidateRouteResources(candidateRouteList: Array<Route>): Promise<CoinPair2LiquidityPoolResource> {
    const result: CoinPair2LiquidityPoolResource = {}
    const coinPairList: Array<CoinPair> = []
    for (let i = 0; i < candidateRouteList.length; i++) {
      const route = candidateRouteList[i]
      for (let j = 0; j < route.length; j++) {
        const coinPair = {
          coinX: route[j].coinX,
          coinY: route[j].coinY,
        }
        pushUnique(coinPairList, coinPair, isCoinPairEqual)
      }
    }

    const taskList = []
    for (let i = 0; i < coinPairList.length; i++) {
      const coinPair = coinPairList[i]
      const task = this.sdk.swap.getLiquidityPool(coinPair.coinX, coinPair.coinY)
      taskList.push(task)
    }

    const resources = await Promise.all(taskList)

    for (let i = 0; i < resources.length; i++) {
      const coinPair = coinPairList[i]
      const resource = resources[i]
      if (!resource) throw new Error('resource LPCoin not found')
      const lpResource = {
        coinX: coinPair.coinX,
        coinY: coinPair.coinY,
        coinXReserve: resource.coin_x_reserve,
        coinYReserve: resource.coin_y_reserve,
      }
      result[coinPair2Key(coinPair)] = lpResource
    }

    return result
  }

  bestTradeExactIn(
    candidateRouteList: Array<Route>,
    coinPair2LiquidityPoolResource: CoinPair2LiquidityPoolResource,
    coinTypeInOrigin: string,
    amountInOrigin: Decimal,
  ): Array<Trade> {
    const bestTrades: Array<Trade> = []
    for (let index = 0; index < candidateRouteList.length; index++) {
      const route = candidateRouteList[index]
      // init
      let currentCoinType = coinTypeInOrigin
      let currentAmountIn = amountInOrigin
      const coinPairList: Array<LiquidityPoolResource> = []
      const amountList: Array<Decimal> = [amountInOrigin]
      let flag = true
      // start route from begin
      for (let i = 0; i < route.length; i++) {
        const pair = route[i]
        const lpResource = coinPair2LiquidityPoolResource[coinPair2Key(pair)]
        if (!lpResource) throw('Internal error')
        const coinTypeOut = (isCoinEqual(pair.coinX, currentCoinType))
          ? pair.coinY
          : pair.coinX
        const [reserveIn, reserveOut] = (isCoinEqual(pair.coinX, currentCoinType))
          ? [d(lpResource.coinXReserve), d(lpResource.coinYReserve)]
          : [d(lpResource.coinYReserve), d(lpResource.coinXReserve)]
        const coinOut = getCoinOutWithFees(currentAmountIn, reserveIn, reserveOut, fee)
        if (coinOut.lt(0) || coinOut.gt(reserveOut)) {
          flag = false
          break
        }
        // prepare for next loop
        currentCoinType = coinTypeOut
        currentAmountIn = coinOut
        coinPairList.push(lpResource)
        amountList.push(currentAmountIn)
      }
      if (!flag) continue
      // route to the end
      const coinTypeList = getCoinTypeList(coinTypeInOrigin, coinPairList)
      const priceImpact = getPriceImpact(coinTypeInOrigin, coinPairList, amountList, fee)
      const newTrade: Trade = {
        coinPairList,
        amountList,
        coinTypeList,
        priceImpact,
      }
      sortedInsert(
        bestTrades,
        newTrade,
        DEFAULT_ROUTE,
        tradeComparator,
      )
    }
    return bestTrades
  }

  bestTradeExactOut(
    candidateRouteList: Array<Route>,
    coinPair2LiquidityPoolResource: CoinPair2LiquidityPoolResource,
    coinTypeInOrigin: string,
    coinTypeOutOrigin: string,
    amountOutOrigin: Decimal,
  ): Array<Trade> {
    const bestTrades: Array<Trade> = []
    for (let index = 0; index < candidateRouteList.length; index++) {
      const route = candidateRouteList[index]
      // init
      let currentCoinType = coinTypeOutOrigin
      let currentAmountOut = amountOutOrigin
      let coinPairList: Array<LiquidityPoolResource> = []
      let amountList: Array<Decimal> = [amountOutOrigin]
      let flag = true
      // start route from begin
      for (let i = route.length - 1; i >= 0; i--) {
        const pair = route[i]
        const lpResource = coinPair2LiquidityPoolResource[coinPair2Key(pair)]
        if (!lpResource) throw('Internal error')
        const coinTypeIn = (isCoinEqual(pair.coinX, currentCoinType))
          ? pair.coinY
          : pair.coinX
        const [reserveIn, reserveOut] = (isCoinEqual(pair.coinX, currentCoinType))
          ? [d(lpResource.coinYReserve), d(lpResource.coinXReserve)]
          : [d(lpResource.coinXReserve), d(lpResource.coinYReserve)]
        const coinIn = getCoinInWithFees(currentAmountOut, reserveOut, reserveIn, fee)
        if (coinIn.lt(0) || coinIn.gt(U64MAX)) {
          flag = false
          break
        }
        // prepare for next loop
        currentCoinType = coinTypeIn
        currentAmountOut = coinIn
        coinPairList = [lpResource, ...coinPairList]
        amountList = [currentAmountOut, ...amountList]
      }
      if (!flag) continue
      // route to the end
      const coinTypeList = getCoinTypeList(coinTypeInOrigin, coinPairList)
      const priceImpact = getPriceImpact(coinTypeInOrigin, coinPairList, amountList, fee)
      const newTrade: Trade = {
        coinPairList,
        amountList,
        coinTypeList,
        priceImpact,
      }
      sortedInsert(
        bestTrades,
        newTrade,
        DEFAULT_ROUTE,
        tradeComparator,
      )
    }
    return bestTrades
  }

  async swapExactCoinForCoinPayload({
    address,
    trade,
    slippage,
  }: SwapCoinPayload): Promise<[TransactionBlock, Payload]> {
    const { modules, coins } = this.sdk.networkOptions
    let coinIdList: Array<string> = []
    const functionEntryName = (() => {
      if (trade.coinPairList.length == 1) {
        return 'swap_exact_coins_for_coins_entry'
      } else if (trade.coinPairList.length == 2) {
        return 'swap_exact_coins_for_coins_2_pair_entry'
      } else {
        throw new Error(`Invalid coin pair length (${trade.coinPairList.length}) value`)
      }
    })()
    
    const fromAmount = trade.amountList[0]
    const toAmount = withSlippage(d(trade.amountList[trade.amountList.length - 1]), d(slippage), 'minus')
    const typeArguments = trade.coinTypeList

    const txb = new TransactionBlock()
    const coinIn = await (async () => {
      if (isCoinEqual(trade.coinTypeList[0], coins.nativeCoin)) {
        return txb.splitCoins(
          txb.gas,
          [txb.pure(fromAmount)],
        )
      } else {
        coinIdList = await this.sdk.swap.getCoinsObjectIdList(address, trade.coinTypeList[0], fromAmount)
        if (coinIdList.length == 0) {
          // tx should fail
          return txb.pure(0)
        } else if (coinIdList.length == 1) {
          return txb.object(coinIdList[0])
        } else {
          txb.mergeCoins(
            txb.object(coinIdList[0]),
            coinIdList.splice(1).map(coinId => txb.object(coinId)),
          )
          return txb.object(coinIdList[0])
        }
      }
    })()
    txb.moveCall({
      target: `${modules.SwapPackage}::${modules.SwapModule}::${functionEntryName}`,
      arguments: [
        txb.object(modules.ObjectLiquidityPools),
        txb.object(modules.ClockModule),
        coinIn,
        txb.pure(fromAmount),
        txb.pure(toAmount),
      ],
      typeArguments: typeArguments,
    })
    txb.setGasBudget(this.sdk.networkOptions.consts.budgetSwap)

    const args = [modules.ObjectLiquidityPools, modules.ClockModule, coinIdList, fromAmount.toString(), toAmount.toString()]
    const rawPayload = {
      packageObjectId: modules.SwapPackage,
      module: modules.SwapModule,
      function: functionEntryName,
      typeArguments: typeArguments,
      arguments: args,
    }
    return [txb, rawPayload]
  }

  async swapCoinForExactCoinPayload({
    address,
    trade,
    slippage,
  }: SwapCoinPayload): Promise<[TransactionBlock, Payload]> {
    const { modules, coins } = this.sdk.networkOptions
    let coinIdList: Array<string> = []
    const functionEntryName = (() => {
      if (trade.coinPairList.length == 1) {
        return 'swap_coins_for_exact_coins_entry'
      } else if (trade.coinPairList.length == 2) {
        return 'swap_coins_for_exact_coins_2_pair_entry'
      } else {
        throw new Error(`Invalid coin pair length (${trade.coinPairList.length}) value`)
      }
    })()

    const typeArguments = trade.coinTypeList
    const toAmount = trade.amountList[trade.amountList.length - 1]
    const fromAmount = withSlippage(d(trade.amountList[0]), d(slippage), 'plus')

    const txb = new TransactionBlock()
    const coinIn = await (async () => {
      if (isCoinEqual(trade.coinTypeList[0], coins.nativeCoin)) {
        return txb.splitCoins(
          txb.gas,
          [txb.pure(fromAmount)],
        )
      } else {
        coinIdList = await this.sdk.swap.getCoinsObjectIdList(address, trade.coinTypeList[0], fromAmount)
        if (coinIdList.length == 0) {
          // tx should fail
          return txb.pure(0)
        } else if (coinIdList.length == 1) {
          return txb.object(coinIdList[0])
        } else {
          txb.mergeCoins(
            txb.object(coinIdList[0]),
            coinIdList.splice(1).map(coinId => txb.object(coinId)),
          )
          return txb.object(coinIdList[0])
        }
      }
    })()
    txb.moveCall({
      target: `${modules.SwapPackage}::${modules.SwapModule}::${functionEntryName}`,
      arguments: [
        txb.object(modules.ObjectLiquidityPools),
        txb.object(modules.ClockModule),
        coinIn,
        txb.pure(toAmount),
        txb.pure(fromAmount),
      ],
      typeArguments: typeArguments,
    })

    const args = [modules.ObjectLiquidityPools, modules.ClockModule, coinIdList, toAmount.toString(), fromAmount.toString()]
    const rawPayload = {
      packageObjectId: modules.SwapPackage,
      module: modules.SwapModule,
      function: functionEntryName,
      typeArguments: typeArguments,
      arguments: args,
    }
    txb.setGasBudget(this.sdk.networkOptions.consts.budgetSwap)
    return [txb, rawPayload]
  }
}

export function pushUnique<T>(items: Array<T>, add: T, comparator: (a: T, b: T) => boolean) {
  let index
  for (index = 0; index < items.length; index++) {
    const isEqual = comparator(items[index], add)
    if (isEqual) return
  }
  items.push(add)
}

function isCoinPairEqual(a: CoinPair, b: CoinPair): boolean {
  return isCoinEqual(a.coinX, b.coinX) && isCoinEqual(a.coinY, b.coinY)
}

function isRouteEqual(a: Route, b: Route): boolean {
  if (a.length != b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (!isCoinPairEqual(a[i], b[i])) return false
  }
  return true
}

export function coinPair2Key(coinPair: CoinPair): string {
  return `${coinPair.coinX}, ${coinPair.coinY}`
}

function trade2Route(trade: Trade): Route {
  const route: Route = []
  for (let i = 0; i < trade.coinPairList.length; i++) {
    const current = trade.coinPairList[i]
    if (!current) continue
    route.push({
      coinX: current.coinX,
      coinY: current.coinY,
    })
  }
  return route
}

// Get n random index from array. return index array
function getRandomIndexFromArray<T>(items: Array<T>, n: number) : Array<number> {
  const indexList = []
  let resultIndexList: Array<number> = []
  const len = items.length
  for (let i = 0; i < len; i++) {
    indexList.push(i)
  }
  while (resultIndexList.length < n) {
    const randIndex = getRandomInt(0, len)
    if (!resultIndexList.includes(randIndex)) {
      resultIndexList.push(randIndex)
      resultIndexList = resultIndexList.slice(0, randIndex).concat(resultIndexList.slice(randIndex + 1, resultIndexList.length))
    }
  }
  return resultIndexList
}

function removeDup(items: Array<number>): Array<number> {
  const result: Array<number> = []
  for (let i = 0; i < items.length; i++) {
    if (!result.includes(items[i])) {
      result.push(items[i])
    }
  }
  return result
}

export function sortedInsert<T>(items: T[], add: T, maxSize: number, comparator: (a: T, b: T) => number) {
  let index
  for (index = 0; index < items.length; index++) {
    const comp = comparator(items[index], add)
    if (comp >= 0) {
      break
    } else if (comp == -1) {
      continue
    }
  }
  items.splice(index, 0, add)
  if (items.length > maxSize) {
    items.pop()
  }
}

export function tradeComparator(trade1: Trade, trade2: Trade): number {
  const trade1In = d(trade1.amountList[0])
  const trade2In = d(trade2.amountList[0])
  const trade1Out = d(trade1.amountList[trade1.amountList.length - 1])
  const trade2Out = d(trade2.amountList[trade2.amountList.length - 1])
  if (trade1In.eq(trade2In)) {
    if (trade1Out.eq(trade2Out)) {
      return trade1.amountList.length - trade2.amountList.length
    }
    if (trade1Out.lessThan(trade2Out)) {
      return 1
    } else {
      return -1
    }
  } else {
    if (trade1In.lessThan(trade2In)) {
      return -1
    } else {
      return 1
    }
  }
}

export function getCoinTypeList(coinInType: string, coinPairList: LiquidityPoolResource[]): string[] {
  const coinTypeList = [coinInType]
  let currentCoinType = coinInType
  for (let i = 0; i < coinPairList.length; i++) {
    const coinPair = coinPairList[i]
    if (!coinPair) continue
    if (isCoinEqual(coinPair.coinX, currentCoinType)) {
      currentCoinType = coinPair.coinY
      coinTypeList.push(coinPair.coinY)
    } else {
      currentCoinType = coinPair.coinX
      coinTypeList.push(coinPair.coinX)
    }
  }
  return coinTypeList
}

// calculated as: abs(realAmountOut - noImpactAmountOut) / noImpactAmountOut
export function getPriceImpact(coinInType: string, coinPairList: LiquidityPoolResource[], amountList: Decimal[], fee: Decimal): Decimal {
  const realAmountOut = amountList[amountList.length - 1]
  let noImpactAmountOut = amountList[0].mul(d(10000).sub(fee)).div(10000)
  let currentCoinType = coinInType
  for (let i = 0; i < coinPairList.length; i++) {
    const coinPair = coinPairList[i]
    if (!coinPair) continue
    if (isCoinEqual(coinPair.coinX, currentCoinType)) {
      currentCoinType = coinPair.coinY
      noImpactAmountOut = noImpactAmountOut.mul(d(coinPair.coinYReserve)).div(d(coinPair.coinXReserve))
    } else {
      currentCoinType = coinPair.coinX
      noImpactAmountOut = noImpactAmountOut.mul(d(coinPair.coinXReserve)).div(d(coinPair.coinYReserve))
    }
  }
  const priceImpact = realAmountOut.sub(noImpactAmountOut).div(noImpactAmountOut)
  return priceImpact.abs()
}
