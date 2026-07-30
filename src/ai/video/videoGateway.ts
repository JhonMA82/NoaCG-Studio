// The video harness's ONE door to the model gateway.
//
// It exists for a single reason: every call the video harness makes must carry
// `surface: 'video'`, because that is what lets the server apply the `ai.video`
// entitlement to traffic that otherwise looks exactly like an SPX harness call on the
// same endpoint (docs/ADMIN.md, the enforcement table).
//
// A discriminator each call site sets by hand is a discriminator the next call site
// forgets, and the failure is silent - the request succeeds, it just stops being gateable.
// So the video provider imports these two functions instead of `../modelGateway`, and the
// surface is filled in here where it cannot be omitted.
//
// This is the ONE file in src/ai/video allowed to import ../modelGateway, pinned by eslint
// (see the `src/ai/video` regions in eslint.config.js) - which is why it re-exports the two
// gateway TYPES the harness needs. A rule with an exception a reviewer has to remember is
// not a rule; making the door the only path makes the boundary mechanical.

import {
  callModel as callModelUntagged,
  callModelDetailed as callModelDetailedUntagged,
  type GatewayModelRequest,
} from '../modelGateway';
import type { ModelResult } from '../modelTypes';

export type { ContentBlock, ModelTool } from '../modelGateway';

/** The video harness's request shape: the gateway's, minus the surface it does not choose. */
export type VideoModelRequest = Omit<GatewayModelRequest, 'surface'>;

export async function callVideoModelDetailed(request: VideoModelRequest): Promise<ModelResult> {
  return callModelDetailedUntagged({ ...request, surface: 'video' });
}

export async function callVideoModel(request: VideoModelRequest): Promise<unknown> {
  return callModelUntagged({ ...request, surface: 'video' });
}
