import { http, createConfig, fallback } from 'wagmi'
import { base } from 'wagmi/chains'
import { injected, coinbaseWallet } from 'wagmi/connectors'

// Use multiple RPCs with fallback to avoid rate limiting
// Only use RPCs allowed by CSP: *.base.org, *.llamarpc.com, *.coinbase.com
const baseTransport = fallback([
  // Base official RPC first - most reliable for fresh data
  http('https://mainnet.base.org', { timeout: 10_000 }),
  // LlamaRPC as fallback (can have stale data issues)
  http('https://base.llamarpc.com', { timeout: 10_000 }),
  // Default wagmi RPC as final fallback
  http(),
])

export const config = createConfig({
  chains: [base],
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'Meezan' }),
  ],
  transports: {
    [base.id]: baseTransport,
  },
})

declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
