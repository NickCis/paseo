import type { Logger } from "pino";

import type { AgentPermissionResponse, AgentPermissionResult } from "./agent-sdk-types.js";
import { startAgentRun, type AgentRunController } from "./agent-prompt.js";

export interface PermissionResponseAgentManager extends AgentRunController {
  respondToPermission(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<AgentPermissionResult | void>;
}

export interface RespondToAgentPermissionParams {
  agentManager: PermissionResponseAgentManager;
  agentId: string;
  requestId: string;
  response: AgentPermissionResponse;
  logger: Logger;
}

/** Cap how long we wait for a plan turn to settle before starting a follow-up. */
const FOLLOW_UP_IDLE_TIMEOUT_MS = 30_000;
const FOLLOW_UP_IDLE_POLL_MS = 50;

export async function respondToAgentPermission(
  params: RespondToAgentPermissionParams,
): Promise<void> {
  const { agentManager, agentId, requestId, response, logger } = params;
  logger.debug(
    { agentId, requestId },
    `Handling permission response for agent ${agentId}, request ${requestId}`,
  );

  const result = await agentManager.respondToPermission(agentId, requestId, response);
  logger.debug({ agentId }, `Permission response forwarded to agent ${agentId}`);

  if (!result?.followUpPrompt) {
    return;
  }

  const replaceRunning = result.replaceRunning !== false;
  if (!replaceRunning) {
    await waitForAgentIdle({ agentManager, agentId, logger });
  }

  logger.debug(
    { agentId, replaceRunning },
    "Permission response requires follow-up turn, starting agent stream",
  );
  await startAgentRun(agentManager, agentId, result.followUpPrompt, logger, {
    replaceRunning,
  });
}

async function waitForAgentIdle({
  agentManager,
  agentId,
  logger,
}: {
  agentManager: PermissionResponseAgentManager;
  agentId: string;
  logger: Logger;
}): Promise<void> {
  if (!agentManager.hasInFlightRun(agentId)) {
    return;
  }

  logger.debug({ agentId }, "Waiting for in-flight turn to settle before follow-up prompt");
  const deadline = Date.now() + FOLLOW_UP_IDLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(FOLLOW_UP_IDLE_POLL_MS);
    if (!agentManager.hasInFlightRun(agentId)) {
      return;
    }
  }

  throw new Error(
    `Timed out waiting for agent ${agentId} to finish the current turn before starting the follow-up prompt`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
