import { Connection, JsonRpcProvider } from '@mysten/sui.js'
import { SwapModule } from './modules/SwapModule'
import { RouteModule } from './modules/RouteModule'

export enum NetworkType {
  Devnet = 'DEVNET',
  Testnet = 'TESTNET',
  Mainnet = 'MAINNET',
}

const NetworkType2ConnectionConfig = {
  'DEVNET': {
    fullnode: 'https://fullnode.devnet.sui.io',
  },
  'TESTNET': {
    fullnode: 'https://fullnode.testnet.sui.io',
  },
  'MAINNET': {
    fullnode: 'https://fullnode.mainnet.sui.io',
  },
}

export type SdkOptions = {
  networkOptions: {
    coins: {
      nativeCoin: string
      testCoin1: string
      testCoin2: string
    }
    modules: {
      SwapPackage: string
      SwapModule: string
      ObjectLiquidityPools: string
      ClockModule: string
    }
    consts: {
      budgetSwap: number
      budgetAddRm: number
    }
  }
}

export class SDK {
  protected _client: JsonRpcProvider
  protected _networkOptions: SdkOptions['networkOptions']
  protected _swap: SwapModule
  protected _route: RouteModule

  get client() {
    return this._client
  }

  get networkOptions() {
    return this._networkOptions
  }

  get swap() {
    return this._swap
  }

  get route() {
    return this._route
  }

  constructor(network?: NetworkType, endpoint?: string) {
    const mainnetOptions: SdkOptions['networkOptions'] = {
      coins: {
        nativeCoin: '0x2::sui::SUI',
        testCoin1: '0x1495bf38cc489bb78e4fc4de6ad5d57954b66b5a260f84e9bf6bcd5d0514c8db::usdc::USDC',
        testCoin2: '0x1495bf38cc489bb78e4fc4de6ad5d57954b66b5a260f84e9bf6bcd5d0514c8db::usdt::USDT',
      },
      modules: {
        SwapPackage: '0x52f01dfd105356b65f50e2ec4e545a7aca7874bf5575b395f3243d6ea86ab243',
        SwapModule: 'animeswap',
        ObjectLiquidityPools: '0xfc1e901bb036078949dd2f66bc2c7b77613916ef1369a9accba661772e0230b2',
        ClockModule: '0x0000000000000000000000000000000000000000000000000000000000000006',
      },
      consts: {
        budgetSwap: 2e4,
        budgetAddRm: 1e5,
      },
    }
    const testnetOptions: SdkOptions['networkOptions'] = {
      coins: {
        nativeCoin: '0x2::sui::SUI',
        testCoin1: '0x702a609dc22a429a14618c86147e99c711b00d15653083fe17cf16861cd3b97b::usdc::USDC',
        testCoin2: '0x702a609dc22a429a14618c86147e99c711b00d15653083fe17cf16861cd3b97b::usdt::USDT',
      },
      modules: {
        SwapPackage: '0xde715da6fad069acbc67dd7f0921e410e0fbd8c422c4500404feba3c5667e712',
        SwapModule: 'animeswap',
        ObjectLiquidityPools: '0x458d342380ed630b2df420897b78564d557365604685083c456b6b6c2ba2ce0b',
        ClockModule: '0x0000000000000000000000000000000000000000000000000000000000000006',
      },
      consts: {
        budgetSwap: 2e8,
        budgetAddRm: 5e8,
      },
    }
    let networkOptions = mainnetOptions
    if (network == NetworkType.Mainnet || network === undefined) networkOptions = mainnetOptions
    if (network == NetworkType.Testnet) networkOptions = testnetOptions
    this._networkOptions = networkOptions
    const url = endpoint
      ? { fullnode: endpoint }
      : NetworkType2ConnectionConfig[network ? network : 'MAINNET']
    const connection = new Connection(url)
    this._client = new JsonRpcProvider(connection)
    this._swap = new SwapModule(this)
    this._route = new RouteModule(this)
  }
}
