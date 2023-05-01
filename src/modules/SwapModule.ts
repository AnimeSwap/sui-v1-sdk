import { TransactionBlock } from '@mysten/sui.js'
import { IModule } from '../interfaces/IModule'
import { Decimal } from '../main'
import { SDK } from '../sdk'
import { BigNumber } from '../types/common'
import { AddLiquidityParams, AddLiquidityReturn, AdminData, LiquidityPool, LiquidityPoolResource, LPCoinResource, PairInfo, PairList, RemoveLiquidityParams, RemoveLiquidityReturn } from '../types/swap'
import { isCoinEqual, notEmpty } from '../utils/contract'
import { composeLiquidityPoolName, composeLPCoin, composeLPCoinType } from '../utils/contractComposeType'
import { addHexPrefix, hexLeftPadding } from '../utils/hex'
import { d } from '../utils/number'
import { DynamicFieldPage, DynamicFieldInfo } from '@mysten/sui.js/dist/types/dynamic_fields'

export type LiquidityPoolsReturn = {
  adminData: AdminData
  pairList: PairList
}

export type AddLiquidityPayload = {
  address: string
  coinX: string
  coinY: string
  amountX: BigNumber
  amountY: BigNumber
  slippage: BigNumber
}

export type RemoveLiquidityPayload = {
  address: string
  coinX: string
  coinY: string
  amount: BigNumber
  amountXDesired: BigNumber
  amountYDesired: BigNumber
  slippage: BigNumber
}

export class SwapModule implements IModule {
  protected _sdk: SDK

  get sdk() {
    return this._sdk
  }

  constructor(sdk: SDK) {
    this._sdk = sdk
  }

  async getDynamicFields(objectId: string): Promise<Array<DynamicFieldInfo>> {
    let cursor: string | null = null
    const pages: DynamicFieldPage[] = []
    let isFinish = false

    while (!isFinish) {
        const page: DynamicFieldPage = await this.sdk.client.getDynamicFields({ parentId: objectId, cursor: cursor })
        pages.push(page)
        cursor = page.nextCursor
        if (!page.hasNextPage) {
          isFinish = true
        }
    }

    const infos = (pages.flatMap(page => page.data) as Array<DynamicFieldInfo>)
    return infos
  }

  /**
   * get address's coin object id lists by coinType. Used for split coins
   * @param address address
   * @param typeArg coinType
   * @param leastAmount least amount for sum of coin balance
   * @returns coin object id lists
   */
  async getCoinsObjectIdList(address: string, typeArg: string, leastAmount: Decimal): Promise<Array<string>> {
    try {
      const ret: Array<string> = []
      let curAmount = d(0)
      let data = await this.sdk.client.getCoins({
        owner: address,
        coinType: typeArg,
      })
      for (const item of data.data) {
        ret.push(item.coinObjectId)
        curAmount = curAmount.add(item.balance)
        if (curAmount.gte(leastAmount)) break
      }
      while (curAmount.lt(leastAmount) && data.hasNextPage) {
        data = await this.sdk.client.getCoins({
          owner: address,
          coinType: typeArg,
          cursor: data.nextCursor,
        })
        for (const item of data.data) {
          ret.push(item.coinObjectId)
          curAmount = curAmount.add(item.balance)
          if (curAmount.gte(leastAmount)) break
        }
      }
      return ret
    } catch (e) {
      return []
    }
  }

  /**
   * Get LiquidityPools NFT meta, including AdminData and PairInfo
   * @returns LiquidityPools meta data
   */
  async getLiquidityPools(): Promise<LiquidityPoolsReturn> {
    const { modules } = this.sdk.networkOptions
    const objectDataResponse = await this.sdk.client.getObject({
      id: modules.ObjectLiquidityPools,
      options: {
        showContent: true,
      },
    })
    const details = objectDataResponse.data?.content as unknown as any
    const adminData: AdminData = details.fields.admin_data.fields
    const pairInfo: PairInfo = details.fields.pair_info.fields.pair_list
    const pairList: PairList = pairInfo.map(item => {
      return {
        coinX: addHexPrefix(item.fields.coin_x),
        coinY: addHexPrefix(item.fields.coin_y),
      }
    })
    return {
      adminData,
      pairList,
    }
  }

  /**
   * Get LiquidityPool data, with coin type coinX, coinY
   * @param coinX coinX
   * @param coinY coinY
   * @returns LiquidityPool data
   */
  async getLiquidityPool(coinX: string, coinY: string): Promise<LiquidityPool> {
    const { modules } = this.sdk.networkOptions
    const lpType = composeLiquidityPoolName(modules.SwapPackage, modules.SwapModule, hexLeftPadding(coinX), hexLeftPadding(coinY))
    const objectDataResponse = await this.sdk.client.getDynamicFieldObject({
      parentId: modules.ObjectLiquidityPools,
      name: {
        type: '0x1::ascii::String',
        value: lpType,
      },
    })
    // if (objectDataResponse.status !== 'Exists') throw new Error(`Invalid LiquidityPoo Pair (${coinX}|${coinY})`)
      const content = objectDataResponse.data?.content as any
    const lp = content.fields as LiquidityPool
    return lp
  }

  /**
   * Check if pair exists
   * @param coinX coinX
   * @param coinY coinY
   * @returns if pair exists
   */
  async isPairExist(coinX: string, coinY: string): Promise<boolean> {
    const { modules } = this.sdk.networkOptions
    const lpType = composeLiquidityPoolName(modules.SwapPackage, modules.SwapModule, coinX, coinY)
    const dynamicFieldsData = await this.getDynamicFields(modules.ObjectLiquidityPools)
    const arr = dynamicFieldsData.filter(v=>v.name.value == lpType)
    return arr.length > 0
  }
  
  /**
   * The function will return all LPCoin with a given address
   * @param address 
   * @returns all LPCoin it owns
   */
  async getAllLPCoinResourcesByAddress(address: string): Promise<Array<LPCoinResource>> {
    const { modules } = this.sdk.networkOptions
    const objects = await this.sdk.client.getOwnedObjects({
      owner: address,
      options: {
        showContent: true,
      },
    })

    // get filteredObjectIds
    const lpCoinType = composeLPCoinType(modules.SwapPackage)
    const regexStr = `^0x2::coin::Coin<${lpCoinType}<(.+?::.+?::.+?(<.+>)?), (.+?::.+?::.+?(<.+>)?)>>$`
    const lpCoin2Meta: { [key: string]: {coinX: string, coinY: string, value: Decimal} } = {} 
    const filteredObjectIds = objects.data.map(o => {
      const type = (o.data?.content as any).type
      if (type) {
        const regex = new RegExp(regexStr, 'g')
        const regexResult = regex.exec(type)
        if (!regexResult) return null
        const coinX = regexResult[1]
        const coinY = regexResult[3]
        const lpCoin = composeLPCoin(modules.SwapPackage, modules.SwapModule, coinX, coinY)
        lpCoin2Meta[lpCoin] = {
          coinX,
          coinY,
          value: d(0),
        }
        return o.data?.objectId
      } else {
        return null
      }
    }).filter(notEmpty)
    
    // query objects
    const taskList = []
    for (let i = 0; i < filteredObjectIds.length; i++) {
      const objectId = filteredObjectIds[i]
      const task = this.sdk.client.getObject({
        id: objectId,
        options: {
          showContent: true,
        },
      })
      taskList.push(task)
    }
    const resources = await Promise.all(taskList)
    resources.forEach(resource => {
      const content = resource.data?.content as any
      const type = content.type
      const regex = new RegExp(regexStr, 'g')
      const regexResult = regex.exec(type)
      if (!regexResult) throw new Error('unexpected error')
      const coinX = regexResult[1]
      const coinY = regexResult[3]
      const lpCoin = composeLPCoin(modules.SwapPackage, modules.SwapModule, coinX, coinY)
      lpCoin2Meta[lpCoin].value = lpCoin2Meta[lpCoin].value.add(d(content.fields.balance))
    })

    const ret: Array<LPCoinResource> = []
    for (const [key, value] of Object.entries(lpCoin2Meta)) {
      ret.push({
        coinX: value.coinX,
        coinY: value.coinY,
        lpCoin: key,
        value: value.value,
      })
    }
    return ret
  }

  /**
   * Add liqudity rate, given CoinX, CoinY, fixedCoin and fixedCoin Amount, the function will return meta such as: the other CoinAmount, shareOfPool
   * @param params AddLiquidityParams
   * @returns 
   */
  async addLiquidityRates({
    coinX,
    coinY,
    amount,
    fixedCoin,
  }: AddLiquidityParams): Promise<AddLiquidityReturn> {
    const lp = await this.getLiquidityPool(coinX, coinY)

    const coinXReserve = d(lp.coin_x_reserve)
    const coinYReserve = d(lp.coin_y_reserve)
    const [reserveX, reserveY] = [coinXReserve, coinYReserve]
    const outputAmount =
      fixedCoin == 'X'
        ? quote(amount, reserveX, reserveY)
        : quote(amount, reserveY, reserveX)

    return {
      amount: outputAmount,
      coinXDivCoinY: reserveX.div(reserveY),
      coinYDivCoinX: reserveY.div(reserveX),
      shareOfPool: amount.div((fixedCoin == 'X' ? reserveX : reserveY).add(amount)),
    }
  }

  /**
   * Remove liqudity rate, given CoinX, CoinY, LPCoin Amount, the function will return meta such as: amountX, amountY
   * @param params RemoveLiquidityParams
   * @returns 
   */
  async removeLiquidityRates({
    coinX,
    coinY,
    amount,
  }: RemoveLiquidityParams): Promise<RemoveLiquidityReturn> {
    const lp = await this.getLiquidityPool(coinX, coinY)

    const lpSupply = d(lp.lp_supply.fields.value) // lp total supply
    if (amount.gt(lpSupply)) {
      throw new Error(`Invalid amount (${amount}) value, larger than total lpCoin supply`)
    }

    const coinXReserve = d(lp.coin_x_reserve)
    const coinYReserve = d(lp.coin_y_reserve)
    const [reserveX, reserveY] = [coinXReserve, coinYReserve]
    const coinXout = amount.mul(reserveX).div(lpSupply).floor()
    const coinYout = amount.mul(reserveY).div(lpSupply).floor()

    return {
      amountX: coinXout,
      amountY: coinYout,
    }
  }

  async addLiquidityPayload({
    address,
    coinX,
    coinY,
    amountX,
    amountY,
    slippage,
  }: AddLiquidityPayload): Promise<TransactionBlock> {
    const { modules, coins } = this.sdk.networkOptions
    amountX = d(amountX)
    amountY = d(amountY)
    slippage = d(slippage)

    if (slippage.gte(1) || slippage.lte(0)) {
      throw new Error(`Invalid slippage (${slippage}) value`)
    }

    const functionEntryName = 'add_liquidity_entry'
    const amountXDesired = amountX
    const amountYDesired = amountY
    const amountXMin = withSlippage(amountX, slippage, 'minus')
    const amountYMin = withSlippage(amountY, slippage, 'minus')
    const typeArguments = [coinX, coinY]

    const txb = new TransactionBlock()
    const coinXIn = await (async () => {
      if (isCoinEqual(coinX, coins.nativeCoin)) {
        return txb.splitCoins(
          txb.gas,
          [txb.pure(amountX)],
        )
      } else {
        const coinXIdList = await this.sdk.swap.getCoinsObjectIdList(address, coinX, amountX)
        if (coinXIdList.length == 0) {
          // tx should fail
          return txb.pure(0)
        } else if (coinXIdList.length == 1) {
          return txb.object(coinXIdList[0])
        } else {
          txb.mergeCoins(
            txb.object(coinXIdList[0]),
            coinXIdList.splice(1).map(coinId => txb.object(coinId)),
          )
          return txb.object(coinXIdList[0])
        }
      }
    })()
    const coinYIn = await (async () => {
      if (isCoinEqual(coinY, coins.nativeCoin)) {
        return txb.splitCoins(
          txb.gas,
          [txb.pure(amountY)],
        )
      } else {
        const coinYIdList = await this.sdk.swap.getCoinsObjectIdList(address, coinY, amountY)
        if (coinYIdList.length == 0) {
          // tx should fail
          return txb.pure(0)
        } else if (coinYIdList.length == 1) {
          return txb.object(coinYIdList[0])
        } else {
          txb.mergeCoins(
            txb.object(coinYIdList[0]),
            coinYIdList.splice(1).map(coinId => txb.object(coinId)),
          )
          return txb.object(coinYIdList[0])
        }
      }
    })()
    txb.moveCall({
      target: `${modules.SwapPackage}::${modules.SwapModule}::${functionEntryName}`,
      arguments: [
        txb.object(modules.ObjectLiquidityPools),
        txb.object(modules.ClockModule),
        coinXIn,
        coinYIn,
        txb.pure(amountXDesired),
        txb.pure(amountYDesired),
        txb.pure(amountXMin),
        txb.pure(amountYMin),
      ],
      typeArguments: typeArguments,
    })
    txb.setGasBudget(this.sdk.networkOptions.consts.budgetAddRm)
    return txb
  }
  
  async removeLiquidityPayload({
    address,
    coinX,
    coinY,
    amount,
    amountXDesired,
    amountYDesired,
    slippage,
  }: RemoveLiquidityPayload): Promise<TransactionBlock> {
    const { modules } = this.sdk.networkOptions
    amount = d(amount)
    amountXDesired = d(amountXDesired)
    amountYDesired = d(amountYDesired)
    slippage = d(slippage)

    if (slippage.gte(1) || slippage.lte(0)) {
      throw new Error(`Invalid slippage (${slippage}) value`)
    }

    const functionEntryName = 'remove_liquidity_entry'
    const liquidityCoin = composeLPCoin(modules.SwapPackage, modules.SwapModule, coinX, coinY)

    const amountXMin = withSlippage(amountXDesired, slippage, 'minus')
    const amountYMin = withSlippage(amountYDesired, slippage, 'minus')

    const typeArguments = [coinX, coinY]

    const txb = new TransactionBlock()
    const coinIn = await (async () => {
      const coinIdList = await this.sdk.swap.getCoinsObjectIdList(address, liquidityCoin, amount)
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
    })()
    txb.moveCall({
      target: `${modules.SwapPackage}::${modules.SwapModule}::${functionEntryName}`,
      arguments: [
        txb.object(modules.ObjectLiquidityPools),
        txb.object(modules.ClockModule),
        coinIn,
        txb.pure(amount),
        txb.pure(amountXMin),
        txb.pure(amountYMin),
      ],
      typeArguments: typeArguments,
    })
    txb.setGasBudget(this.sdk.networkOptions.consts.budgetAddRm)
    return txb
  }

  /**
   * The function will return all LPCoinResources of the AnimeSwap Protocol
   * @returns 
   */
  async getAllLPCoinResourcesWithAdmin(): Promise<Array<LiquidityPoolResource>> {
    const lpData = await this.getLiquidityPools()
    const allPairs = lpData.pairList
    const ret: Array<LiquidityPoolResource> = []
    const tasks: Array<Promise<LiquidityPool>> = []
    // Refactor this code if rate limit
    for (const pair of allPairs) {
      const task = this.getLiquidityPool(pair.coinX, pair.coinY)
      tasks.push(task)
    }
    const liquidityPools = await Promise.all(tasks)
    if (liquidityPools.length !== allPairs.length) throw new Error('Internal Error')  // should never reach this
    const length = liquidityPools.length
    for (let i = 0; i < length; i++) {
      const pair = allPairs[i]
      const liquidityPool = liquidityPools[i]
      const liquidityPoolResource = {
        coinX: pair.coinX,
        coinY: pair.coinY,
        coinXReserve: liquidityPool.coin_x_reserve,
        coinYReserve: liquidityPool.coin_y_reserve,
      }
      ret.push(liquidityPoolResource)
    }
    return ret
   }
}

export function getCoinOutWithFees(
  coinInVal: Decimal,
  reserveInSize: Decimal,
  reserveOutSize: Decimal,
  fee: Decimal,
) {
  const { feePct, feeScale } = { feePct: fee, feeScale: d(10000) }
  const feeMultiplier = feeScale.sub(feePct)
  const coinInAfterFees = coinInVal.mul(feeMultiplier)
  const newReservesInSize = reserveInSize.mul(feeScale).plus(coinInAfterFees)

  return coinInAfterFees.mul(reserveOutSize).div(newReservesInSize).floor()
}

export function getCoinInWithFees(
  coinOutVal: Decimal,
  reserveOutSize: Decimal,
  reserveInSize: Decimal,
  fee: Decimal,
) {
  const { feePct, feeScale } = { feePct: fee, feeScale: d(10000) }
  const feeMultiplier = feeScale.sub(feePct)
  const newReservesOutSize = reserveOutSize.sub(coinOutVal).mul(feeMultiplier)

  return coinOutVal.mul(feeScale).mul(reserveInSize).div(newReservesOutSize).plus(1).floor()
}

export function withSlippage(value: Decimal, slippage: Decimal, mode: 'plus' | 'minus') {
  const amountWithSlippage = value[mode](value.mul(slippage))
  return mode === 'plus' ? amountWithSlippage.ceil() : amountWithSlippage.floor()
}

function quote(
  amountX: Decimal,
  reserveX: Decimal,
  reserveY: Decimal,
) {
  return amountX.mul(reserveY).div(reserveX).floor()
}
