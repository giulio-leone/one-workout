/**
 * Mesh Stream Protocol Types
 */

export interface MeshAgentStartEvent {
  type: 'agent_start';
  timestamp: string;
  data: {
    agent: string;
    label: string;
  };
}

export interface MeshAgentCompleteEvent {
  type: 'agent_complete';
  timestamp: string;
  data: {
    agent: string;
    durationMs?: number;
  };
}
