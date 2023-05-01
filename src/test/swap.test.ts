import SDK, { NetworkType } from '../main'
import { mulDecimals, divDecimals, d } from '../utils/number'
const address = '0xd7086a6284d01b710286a384d81761657b41ebef78e652e720d38c311bfd1678'

describe('Swap Module', () => {
  const sdk = new SDK(NetworkType.Testnet)
  const CoinsMapping: { [key: string]: string } = {
    NATIVE: sdk.networkOptions.coins.nativeCoin,
    TEST1: sdk.networkOptions.coins.testCoin1,
    TEST2: sdk.networkOptions.coins.testCoin2,
    TESTN: '0x1495bf38cc489bb78e4fc4de6ad5d57954b66b5a260f84e9bf6bcd5d0514c8db::mock::MOCK',
  }
  const CoinInfo: { [key: string]: { decimals: number } } = {
    NATIVE: { decimals: 8 },
    TEST1: { decimals: 8 },
    TEST2: { decimals: 8 },
  }
  test('getLiquidityPools', async () => {
    const data = await sdk.swap.getLiquidityPools()
    console.log(data.adminData)
    console.log(data.pairList)
    expect(1).toBe(1)
  })

  test('getCoinsObjectIdList', async () => {
    const data = await sdk.swap.getCoinsObjectIdList(address, CoinsMapping.NATIVE, d(0))
    console.log(data)
    expect(1).toBe(1)
  })

  test('isPairExist true', async () => {
    const data = await sdk.swap.isPairExist(CoinsMapping.TEST1, CoinsMapping.TEST2)
    expect(data).toBe(true)
    const data2 = await sdk.swap.isPairExist(CoinsMapping.NATIVE, CoinsMapping.TEST2)
    expect(data2).toBe(true)
  })

  test('isPairExist false', async () => {
    const data = await sdk.swap.isPairExist(CoinsMapping.NATIVE, CoinsMapping.TESTN)
    expect(data).toBe(false)
  })

  test('getLiquidityPool', async () => {
    const data = await sdk.swap.getLiquidityPool(CoinsMapping.TEST1, CoinsMapping.TEST2)
    console.log(data)
    const data2 = await sdk.swap.getLiquidityPool(CoinsMapping.NATIVE, CoinsMapping.TEST2)
    console.log(data2)
    expect(1).toBe(1)
  })

  test('getAllLPCoinResourcesByAddress', async () => {
    const output = await sdk.swap.getAllLPCoinResourcesByAddress(address)
    console.log(output)
    expect(1).toBe(1)
  })

  test('getAllLPCoinResourcesWithAdmin', async () => {
    const output = await sdk.swap.getAllLPCoinResourcesWithAdmin()
    console.log(output)
    expect(output.length).toBeGreaterThanOrEqual(1)
  })

  test('addLiquidityRates', async () => {
    const output = await sdk.swap.addLiquidityRates({
      coinX: CoinsMapping.TEST1,
      coinY: CoinsMapping.TEST2,
      fixedCoin: 'X',
      amount: mulDecimals(1, CoinInfo.TEST1.decimals),
    })

    console.log(output)
    console.log({
      amount: output.amount,
      pretty: divDecimals(output.amount, CoinInfo.TEST2.decimals),
    })

    expect(1).toBe(1)
  })

  test('removeLiquidityRates', async () => {
    const output = await sdk.swap.removeLiquidityRates({
      coinX: CoinsMapping.TEST1,
      coinY: CoinsMapping.TEST2,
      amount: d(10000),
    })

    console.log(output)
    expect(1).toBe(1)
  })

  test('addLiquidityPayload', async () => {
    const data = await sdk.swap.addLiquidityPayload({
      address: address,
      coinX: CoinsMapping.TEST1,
      coinY: CoinsMapping.TEST2,
      amountX: '1000000000',
      amountY: '1000000000',
      slippage: 0.05,
    })
    console.log(data)
    expect(1).toBe(1)
  })

  test('removeLiquidityPayload', async () => {
    const data = await sdk.swap.removeLiquidityPayload({
      address: address,
      coinX: CoinsMapping.TEST1,
      coinY: CoinsMapping.TEST2,
      amount: '100000000',
      amountXDesired: '1000000000',
      amountYDesired: '1000000000',
      slippage: 0.05,
    })
    console.log(data)
    expect(1).toBe(1)
  })
  
})
