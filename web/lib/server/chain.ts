// Single chain seam for the App Router — one ChainService per server process,
// picked by CHAIN_MODE exactly as the Express backend's app.locals.chainService
// was. Nothing in a route handler touches ethers.js or the mock directly.

import { createChainService } from "@/lib/server/services/chainService";

export const chainService = createChainService(process.env);