import { describe, expect, test, vi } from "vitest";

import { createTestLogger } from "../../test-utils/test-logger.js";
import type {
  AgentPromptInput,
  AgentPermissionResult,
  AgentRunOptions,
  AgentPermissionResponse,
} from "./agent-sdk-types.js";
import type { AgentStreamEvent } from "../messages.js";
import { respondToAgentPermission } from "./permission-response.js";

class FakePermissionAgentManager {
  permissionResult: AgentPermissionResult | void;
  hasRunInFlight = false;
  /** After this many hasInFlightRun checks, report idle. */
  inFlightUntilChecks = 0;
  hasInFlightCheckCount = 0;
  outOfBandHandled = false;
  permissionResponses: Array<{
    agentId: string;
    requestId: string;
    response: AgentPermissionResponse;
  }> = [];
  streamRuns: Array<{ agentId: string; prompt: AgentPromptInput; options?: AgentRunOptions }> = [];
  replacementRuns: Array<{ agentId: string; prompt: AgentPromptInput; options?: AgentRunOptions }> =
    [];

  async respondToPermission(
    agentId: string,
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<AgentPermissionResult | void> {
    this.permissionResponses.push({ agentId, requestId, response });
    return this.permissionResult;
  }

  tryRunOutOfBand(): boolean {
    return this.outOfBandHandled;
  }

  getAgent() {
    return undefined;
  }

  hasInFlightRun(): boolean {
    this.hasInFlightCheckCount += 1;
    if (this.inFlightUntilChecks > 0) {
      const stillInFlight = this.hasInFlightCheckCount <= this.inFlightUntilChecks;
      return stillInFlight;
    }
    return this.hasRunInFlight;
  }

  streamAgent(
    agentId: string,
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentStreamEvent> {
    this.streamRuns.push({ agentId, prompt, options });
    return emptyAgentStream();
  }

  async replaceAgentRun(
    agentId: string,
    prompt: AgentPromptInput,
    options?: AgentRunOptions,
  ): Promise<AsyncGenerator<AgentStreamEvent>> {
    this.replacementRuns.push({ agentId, prompt, options });
    return emptyAgentStream();
  }
}

async function* emptyAgentStream(): AsyncGenerator<AgentStreamEvent> {}

describe("respondToAgentPermission", () => {
  const logger = createTestLogger();

  test("starts a follow-up run returned by the provider permission response", async () => {
    const agentManager = new FakePermissionAgentManager();
    agentManager.permissionResult = { followUpPrompt: "implement the approved plan" };

    await respondToAgentPermission({
      agentManager,
      agentId: "agent-1",
      requestId: "permission-1",
      response: { behavior: "allow" },
      logger,
    });

    expect(agentManager.permissionResponses).toEqual([
      {
        agentId: "agent-1",
        requestId: "permission-1",
        response: { behavior: "allow" },
      },
    ]);
    expect(agentManager.streamRuns).toEqual([
      {
        agentId: "agent-1",
        prompt: "implement the approved plan",
      },
    ]);
    expect(agentManager.replacementRuns).toEqual([]);
  });

  test("does not start a run when the permission response has no follow-up prompt", async () => {
    const agentManager = new FakePermissionAgentManager();

    await respondToAgentPermission({
      agentManager,
      agentId: "agent-1",
      requestId: "permission-1",
      response: { behavior: "deny", message: "not now" },
      logger,
    });

    expect(agentManager.permissionResponses).toEqual([
      {
        agentId: "agent-1",
        requestId: "permission-1",
        response: { behavior: "deny", message: "not now" },
      },
    ]);
    expect(agentManager.streamRuns).toEqual([]);
    expect(agentManager.replacementRuns).toEqual([]);
  });

  test("replaces an in-flight run for follow-up prompts by default", async () => {
    const agentManager = new FakePermissionAgentManager();
    agentManager.hasRunInFlight = true;
    agentManager.permissionResult = { followUpPrompt: "continue after approval" };

    await respondToAgentPermission({
      agentManager,
      agentId: "agent-1",
      requestId: "permission-1",
      response: { behavior: "allow" },
      logger,
    });

    expect(agentManager.streamRuns).toEqual([]);
    expect(agentManager.replacementRuns).toEqual([
      {
        agentId: "agent-1",
        prompt: "continue after approval",
      },
    ]);
  });

  test("waits for idle then starts without replacing when replaceRunning is false", async () => {
    vi.useFakeTimers();
    const agentManager = new FakePermissionAgentManager();
    // First check (before wait loop) and a few polls stay busy, then idle.
    agentManager.inFlightUntilChecks = 3;
    agentManager.permissionResult = {
      followUpPrompt: "implement after CreatePlan settles",
      replaceRunning: false,
    };

    const pending = respondToAgentPermission({
      agentManager,
      agentId: "agent-1",
      requestId: "permission-1",
      response: { behavior: "allow" },
      logger,
    });

    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(agentManager.replacementRuns).toEqual([]);
    expect(agentManager.streamRuns).toEqual([
      {
        agentId: "agent-1",
        prompt: "implement after CreatePlan settles",
      },
    ]);
    expect(agentManager.hasInFlightCheckCount).toBeGreaterThan(3);
    vi.useRealTimers();
  });

  test("times out when replaceRunning is false and the turn never settles", async () => {
    vi.useFakeTimers();
    const agentManager = new FakePermissionAgentManager();
    agentManager.hasRunInFlight = true;
    agentManager.permissionResult = {
      followUpPrompt: "never starts",
      replaceRunning: false,
    };

    const pending = respondToAgentPermission({
      agentManager,
      agentId: "agent-1",
      requestId: "permission-1",
      response: { behavior: "allow" },
      logger,
    });
    const expectation = expect(pending).rejects.toThrow(
      /Timed out waiting for agent agent-1 to finish the current turn/,
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await expectation;

    expect(agentManager.streamRuns).toEqual([]);
    expect(agentManager.replacementRuns).toEqual([]);
    vi.useRealTimers();
  });
});
