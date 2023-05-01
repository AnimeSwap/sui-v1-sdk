import SDK, { NetworkType } from '../main'
import { d } from '../utils'
const address = '0xd7086a6284d01b710286a384d81761657b41ebef78e652e720d38c311bfd1678'

describe('Swap Module', () => {
  const sdk = new SDK(NetworkType.Testnet)
  const amount = d(1e7)

  test('getAllRoutes', async () => {
    const routes = await sdk.route.getAllRoutes(sdk.networkOptions.coins.testCoin1, sdk.networkOptions.coins.testCoin2)
    console.log(routes)
    console.log(routes.length)
    expect(routes.length).toBeGreaterThanOrEqual(1)
  })

  test('getRouteSwapExactCoinForCoin (multiple times)', async () => {
    const fromCoin = sdk.networkOptions.coins.testCoin1
    const toCoin = sdk.networkOptions.coins.testCoin2
    const allRoutes = await sdk.route.getAllRoutes(fromCoin, toCoin)

    // Round 1
    const candidateRouteList = sdk.route.getCandidateRoutes(allRoutes)
    const allCandidateRouteResources = await sdk.route.getAllCandidateRouteResources(candidateRouteList)
    const bestTrades = sdk.route.bestTradeExactIn(
      candidateRouteList,
      allCandidateRouteResources,
      fromCoin,
      amount,
    )
    console.log(bestTrades)
    
    // Round n, should keep the first two best trades
    const candidateRouteList2 = sdk.route.getCandidateRoutes(allRoutes, bestTrades[0], bestTrades[1])
    const allCandidateRouteResources2 = await sdk.route.getAllCandidateRouteResources(candidateRouteList2)
    const bestTrades2 = sdk.route.bestTradeExactIn(
      candidateRouteList2,
      allCandidateRouteResources2,
      fromCoin,
      amount,
    )
    console.log(bestTrades2)
    expect(1).toBe(1)
  })

  test('getRouteSwapCoinForExactCoin (multiple times)', async () => {
    const fromCoin = sdk.networkOptions.coins.testCoin1
    const toCoin = sdk.networkOptions.coins.testCoin2
    const allRoutes = await sdk.route.getAllRoutes(fromCoin, toCoin)

    // Round 1
    const candidateRouteList = sdk.route.getCandidateRoutes(allRoutes)
    const allCandidateRouteResources = await sdk.route.getAllCandidateRouteResources(candidateRouteList)
    const bestTrades = sdk.route.bestTradeExactOut(
      candidateRouteList,
      allCandidateRouteResources,
      fromCoin,
      toCoin,
      amount,
    )
    console.log(bestTrades)
    
    // Round n, should keep the first two best trades
    const candidateRouteList2 = sdk.route.getCandidateRoutes(allRoutes, bestTrades[0], bestTrades[1])
    const allCandidateRouteResources2 = await sdk.route.getAllCandidateRouteResources(candidateRouteList2)
    const bestTrades2 = sdk.route.bestTradeExactOut(
      candidateRouteList2,
      allCandidateRouteResources2,
      fromCoin,
      toCoin,
      amount,
    )
    console.log(bestTrades2)
    expect(1).toBe(1)
  })
  

  test('swapExactCoinToCoinPayload', async () => {
    const fromCoin = sdk.networkOptions.coins.testCoin1
    const toCoin = sdk.networkOptions.coins.testCoin2
    const allRoutes = await sdk.route.getAllRoutes(fromCoin, toCoin)

    const candidateRouteList = sdk.route.getCandidateRoutes(allRoutes)
    const allCandidateRouteResources = await sdk.route.getAllCandidateRouteResources(candidateRouteList)
    const bestTrades = sdk.route.bestTradeExactIn(
      candidateRouteList,
      allCandidateRouteResources,
      fromCoin,
      amount,
    )
    const output = await sdk.route.swapExactCoinForCoinPayload({
      address: address,
      trade: bestTrades[0],
      slippage: 0.05,
    })
    console.log(output)
    expect(1).toBe(1)
  })

  test('swapCoinForExactCoinPayload', async () => {
    const fromCoin = sdk.networkOptions.coins.testCoin1
    const toCoin = sdk.networkOptions.coins.testCoin2
    const allRoutes = await sdk.route.getAllRoutes(fromCoin, toCoin)

    const candidateRouteList = sdk.route.getCandidateRoutes(allRoutes)
    const allCandidateRouteResources = await sdk.route.getAllCandidateRouteResources(candidateRouteList)
    const bestTrades = sdk.route.bestTradeExactOut(
      candidateRouteList,
      allCandidateRouteResources,
      fromCoin,
      toCoin,
      amount,
    )
    const output = await sdk.route.swapCoinForExactCoinPayload({
      address: address,
      trade: bestTrades[0],
      slippage: 0.05,
    })
    console.log(output)
    expect(1).toBe(1)
  })
})
