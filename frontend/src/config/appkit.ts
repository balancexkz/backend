import { createAppKit } from '@reown/appkit/react';
import { SolanaAdapter } from '@reown/appkit-adapter-solana/react';
import { solana } from '@reown/appkit/networks';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';

const solanaAdapter = new SolanaAdapter({
  wallets: [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
});

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID';

const metadata = {
  name: 'BalanceX',
  description: 'Solana Liquidity Management',
  url: 'https://app.balancex.kz',
  icons: [],
};

createAppKit({
  adapters: [solanaAdapter],
  networks: [solana],
  projectId,
  metadata,
  features: {
    analytics: false,
  },
});
