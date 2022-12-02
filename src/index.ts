/* eslint-disable @typescript-eslint/no-unused-vars */
import { FlashbotsBundleProvider } from "@flashbots/ethers-provider-bundle";
import { Contract, providers, Wallet } from "ethers";
import { BUNDLE_EXECUTOR_ABI } from "./abi";
import { UniswappyV2EthPair } from "./UniswappyV2EthPair";
import { FACTORY_ADDRESSES } from "./addresses";
import { Arbitrage, CrossedMarketDetails } from "./Arbitrage";
import { get } from "https"
import { getDefaultRelaySigningKey } from "./utils";
import UniswappyV2PairDAO from "./models/UniswappyV2Pair";
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL as string

const PRIVATE_KEY = process.env.PRIVATE_KEY as string

const BUNDLE_EXECUTOR_ADDRESS = process.env.BUNDLE_EXECUTOR_ADDRESS as string;

const FLASHBOTS_RELAY_SIGNING_KEY = process.env.FLASHBOTS_RELAY_SIGNING_KEY as string;

const MINER_REWARD_PERCENTAGE = parseInt(process.env.MINER_REWARD_PERCENTAGE || "90")

if (!PRIVATE_KEY) {
  console.warn("Must provide PRIVATE_KEY environment variable")
  process.exit(1)
}
if (!BUNDLE_EXECUTOR_ADDRESS) {
  console.warn("Must provide BUNDLE_EXECUTOR_ADDRESS environment variable. Please see README.md")
  process.exit(1)
}

if (!FLASHBOTS_RELAY_SIGNING_KEY) {
  console.warn("Must provide FLASHBOTS_RELAY_SIGNING_KEY. Please see https://github.com/flashbots/pm/blob/main/guides/searcher-onboarding.md")
  process.exit(1)
}

const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL || ""

const provider = new providers.StaticJsonRpcProvider(ETHEREUM_RPC_URL);

const arbitrageSigningWallet = new Wallet(PRIVATE_KEY);
const flashbotsRelaySigningWallet = new Wallet(FLASHBOTS_RELAY_SIGNING_KEY);

function healthcheck() {
  if (!HEALTHCHECK_URL) {
    return
  }
  get(HEALTHCHECK_URL).on('error', console.error);
}

async function main() {
  console.log("Searcher Wallet Address: " + await arbitrageSigningWallet.getAddress())
  console.log("Flashbots Relay Signing Wallet Address: " + await flashbotsRelaySigningWallet.getAddress())
  const flashbotsProvider = await FlashbotsBundleProvider.create(provider, flashbotsRelaySigningWallet);
  const arbitrage = new Arbitrage(
    arbitrageSigningWallet,
    flashbotsProvider,
    provider,
    new Contract(BUNDLE_EXECUTOR_ADDRESS, BUNDLE_EXECUTOR_ABI, provider) )

  /*
   *  UNCOMMENT LINE BELOW on first run to seed database.
   *    This will take a very long time (hours) and if you are using a free Infura node, you will
   *    run out of request before it finishes.
   *  
   *    I recommend using a Moralis SpeedyNode, which has a 50x higher request limit than Infura for free accounts.
   */
  //await UniswappyV2EthPair.getUniswapMarketsByToken(provider, FACTORY_ADDRESSES);

  
  // Initialize Our Markets
  const allPairs = await UniswappyV2PairDAO.getAllWETHPairAddresses();
  
  const markets = await UniswappyV2EthPair.mapReduceUniswapMarketsByToken(provider, allPairs);

  console.log(`Found ${Object.keys(markets.marketsByToken).length} token across ${markets.filteredMarketPairs.length} pools with sufficient liquidity to Arb.\n\n\n`)

  // Listen for new block
  provider.on('block', async (blockNumber) => {
    const now = new Date();
    console.log(`---------------------------- Block number: ${blockNumber}, ${now.getTime()} --------------------------`)

    // On new block, update reserves of each market pair.
    await UniswappyV2EthPair.updateReserves(provider, markets.filteredMarketPairs, blockNumber);

    // Calculate the best crossed markets
    const bestCrossedMarkets = await arbitrage.evaluateMarkets(markets.marketsByToken);
    if (bestCrossedMarkets.length === 0) {
      return
    }

    // Print all Crossed Markets (optimized for input amount)
    for( const crossedMarket of bestCrossedMarkets) {
      await Arbitrage.printCrossedWETHMarket(crossedMarket);
    }

    // Create and send bundles to FLASHBOTS
    return await arbitrage.takeCrossedMarkets(bestCrossedMarkets, blockNumber, MINER_REWARD_PERCENTAGE).then(() => {
      healthcheck();
      // console.log(`Block number: ${blockNumber}, Took crossed markets: ${((new Date()).getTime() - now.getTime())/1000}`)
      return;
    }).catch(console.error)
  })
}

main();
