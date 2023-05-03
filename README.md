# AnimeSwap Sui v1 Protocol SDK

The typescript SDK for [AnimeSwap](https://animeswap.org) Sui v1 protocol.

* [SDK documents](https://docs.animeswap.org/docs/sdk)
* [Contracts documents](https://docs.animeswap.org/docs/contracts/Sui/contracts)

# Installation

    yarn add "@animeswap.org/sui-v1-sdk"

# Usage Example
### Init SDK
```typescript
import SDK, { NetworkType } from '@animeswap.org/sui-v1-sdk';

const sdk = new SDK(NetworkType.Testnet)
```

### Is pair exist
```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'

  const output = await sdk.swap.isPairExist(SUI, BTC)
})()
```

### Add liquidity rate calculation and txb.

If pair not exists, tx will create pair first

```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'
  const walletAddress = '0xdeadbeef'

  const isPairExist = await sdk.swap.isPairExist(SUI, BTC)

  if (isPairExist) {
    // Add liqudity with a given rate
    const amountIn = 1e8
    const output = await sdk.swap.addLiquidityRates({
      coinX: SUI,
      coinY: BTC,
      fixedCoin: 'X', // 'X' | 'Y'
      amount: amountIn,  // fixedCoin amount
    })

    /**
      output type:
      {
        amount: Decimal
        coinXDivCoinY: Decimal
        coinYDivCoinX: Decimal
        shareOfPool: Decimal
      }
    */

    const txb = sdk.swap.addLiquidityPayload({
      address::walletAddress
      coinX: SUI,
      coinY: BTC,
      amountX: amountIn,
      amountY: output.amount,
      slippage: 0.05, // 5%
    })

    /**
      output type: txb
    */
  } else {
    // Create pair and add initial liquidity
    const txb = sdk.swap.addLiquidityPayload({
      address::walletAddress
      coinX: SUI,
      coinY: BTC,
      amountX: 1e8, // any amount you want
      amountY: 1e7, // any amount you want
      slippage: 0.05, // 5%
    })

    /**
      output type: txb
    */
  }
})()
```

### Remove liquidity rate calculation and txb for existed pairs
```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'
  const walletAddress = '0xdeadbeef'
  const lpAmount = 1e6

  const output = await sdk.swap.removeLiquidityRates({
    coinX: SUI,
    coinY: BTC,
    amount: lpAmount,  // lp amount
  });

  /**
    output type:
    {
      amountX: Decimal
      amountY: Decimal
    }
   */

  const txPayload = sdk.swap.removeLiquidityPayload({
    address: walletAddress,
    coinX: SUI,
    coinY: BTC,
    amount: lpAmount,
    amountXDesired: output.amountX,
    amountYDesired: output.amountY,
    slippage: 0.05, // 5%
    deadline: 30,   // 30 seconds
  })

  /**
    output type: txb
   */
})()
```

### Swap (exact in) rate calculation and txb.

Swap exact coin to coin mode

```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'
  const walletAddress = '0xdeadbeef'
  const aptosAmount = 1e6

  const trades = await sdk.route.getRouteSwapExactCoinForCoin({
    fromCoin: SUI,
    toCoin: BTC,
    amount: aptosAmount,
  });
  if (trades.length == 0) throw("No route error")
  const bestTrade = trades[0]
  /**
    bestTrade type:
    {
      coinPairList: LiquidityPoolResource[]
      amountList: string[]
      coinTypeList: string[]
      priceImpact: Decimal
    }
   */

  const output = sdk.route.swapExactCoinForCoinPayload({
    address: walletAddress,
    trade: bestTrade,
    slippage: 0.05,   // 5%
  })

  /**
    output type: txb
   */
})()
```

### Swap (exact out) rate calculation and txb.

Swap coin to exact coin mode

```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'
  const walletAddress = '0xdeadbeef'
  const btcAmount = 1e6

  const trades = await sdk.route.getRouteSwapCoinForExactCoin({
    fromCoin: SUI,
    toCoin: BTC,
    amount: btcAmount,
  });
  if (trades.length == 0) throw("No route error")
  const bestTrade = trades[0]
  /**
    bestTrade type:
    {
      coinPairList: LiquidityPoolResource[]
      amountList: string[]
      coinTypeList: string[]
      priceImpact: Decimal
    }
   */

  const output = sdk.route.swapCoinForExactCoinPayload({
    address: walletAddress,
    trade: bestTrade,
    slippage: 0.05,   // 5%
  })

  /**
    output type: txb
   */
})()
```

### Get all LPCoin by address
```typescript
(async () => {
  const queryAddress = '0xA11ce'
  const output = await sdk.swap.getAllLPCoinResourcesByAddress(queryAddress)

  /**
    output type:
    [{
      coinX: AptosResourceType
      coinY: AptosResourceType
      lpCoin: AptosResourceType
      value: string
    }]
   */
})()
```

### Get LPCoin amount
```typescript
(async () => {
  const SUI = '0x2::sui::SUI'
  const BTC = '0x16fe2df00ea7dde4a63409201f7f4e536bde7bb7335526a35d05111e68aa322c::TestCoinsV1::BTC'
  const queryAddress = '0xA11ce'

  const output = await sdk.swap.getLPCoinAmount({
    address: queryAddress,
    coinX: SUI,
    coinY: BTC,
  })

  /**
    output type:
    {
      coinX: AptosResourceType
      coinY: AptosResourceType
      lpCoin: AptosResourceType
      value: string
    }
   */
})()
```
