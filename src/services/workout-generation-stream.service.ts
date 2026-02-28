/**
 * Workout Generation Stream Service
 *
 * Handles SSE (Server-Sent Events) streaming for workout generation.
 * Manages event encoding and formatting according to Mesh Stream Protocol.
 */

import type { MeshAgentStartEvent, MeshAgentCompleteEvent } from '../types/mesh-stream';

// Interface used by API Route logic
export interface EventSender {
  // Standard Mesh Methods
  sendAgentStart: (role: string, description: string) => void;
  sendAgentComplete: (role: string, duration?: number) => void;
  sendAgentStep: (role: string, step: string) => void;
  sendAgentError: (role: string, error: { message: string }, retrying: boolean) => void;
  sendComplete: (output: unknown, metadata: Record<string, unknown>) => void;

  // Progress (can be agent specific or global)
  sendAgentProgress: (role: string, progress: number, message: string) => void;
  sendProgress: (progress: number, message: string) => void;

  // Generic fallback for Orchestrator compatibility
  sendEvent: (name: string, data: unknown) => void;
  sendText: (text: string) => void;
}

/**
 * Create event sender for SSE streaming
 */
export function createEventSender(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): EventSender {
  const send = (event: Record<string, unknown>) => {
    // Add timestamp if missing
    if (!event.timestamp) {
      event.timestamp = new Date().toISOString();
    }
    controller.enqueue(
      encoder.encode(`data: ${JSON.stringify(event)}

`)
    );
  };

  return {
    sendAgentStart: (role: string, description: string) => {
      send({
        type: 'agent_start',
        data: { agent: role, label: description },
      });
    },

    sendAgentProgress: (role: string, progress: number, message: string) => {
      send({
        type: 'progress',
        data: { percentage: progress, message, agent: role },
      });
    },

    sendAgentStep: (role: string, step: string) => {
      send({
        type: 'agent_step',
        data: { agent: role, step },
      });
    },

    sendAgentComplete: (role: string, duration: number = 0) => {
      send({
        type: 'agent_complete',
        data: { agent: role, durationMs: duration },
      });
    },

    sendAgentError: (
      role: string,
      error: { message: string; code?: string },
      retrying: boolean
    ) => {
      send({
        type: 'agent_error',
        data: { agent: role, error: error.message, recoverable: retrying },
      });
    },

    sendProgress: (progress: number, message: string) => {
      send({
        type: 'progress',
        data: { percentage: progress, message },
      });
    },

    sendComplete: (output: unknown, metadata: Record<string, unknown>) => {
      send({
        type: 'complete',
        data: { result: output, stats: metadata },
      });
    },

    // Orchestrator compatibility
    sendEvent: (name: string, data: unknown) => {
      const typedData = data as Record<string, unknown>;
      // Map generic events to standard ones if possible
      if (name === 'agent_start') {
        const event: MeshAgentStartEvent = {
          type: 'agent_start',
          timestamp: new Date().toISOString(),
          data: {
            agent: (typedData.role as string) || (typedData.agent as string) || 'unknown',
            label: (typedData.description as string) || (typedData.label as string) || 'Working...',
          },
        };
        send(event as unknown as Record<string, unknown>);
      } else if (name === 'agent_complete') {
        const event: MeshAgentCompleteEvent = {
          type: 'agent_complete',
          timestamp: new Date().toISOString(),
          data: {
            agent: (typedData.role as string) || (typedData.agent as string) || 'unknown',
            durationMs: (typedData.durationMs as number) || (typedData.duration as number),
          },
        };
        send(event as unknown as Record<string, unknown>);
      } else {
        // Fallback for custom events
        send({ type: name, timestamp: new Date().toISOString(), data });
      }
    },

    sendText: (_text: string) => {
      // Ignored in structured stream usually
    },
  };
}
