import { z } from 'zod';

// Connection's published unary request envelope in DSH 0.2.1-rc.3.
// This validates framing only. Connection.admit() and the exact browser Peer
// check remain the authentication authority; this module grants no access.
// Standard z.object semantics intentionally strip unknown envelope fields.
export const clientRequestSchema = z.object({
  type: z.literal('client-request'),
  rpcId: z.string(),
  method: z.string(),
  payload: z.unknown(),
});
