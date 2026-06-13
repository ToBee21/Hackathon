// src/types.ts

export interface PrivacyState {
  privacyScore: number;
  trackersBlockedCount: number;
  noiseGeneratedCount: number;
  activeAliasEmail: string | null;
}

export interface MouseJitterConfig {
  intensity: number;
  isEnabled: boolean;
}

export interface KeystrokeConfig {
  minDelayMs: number;
  maxDelayMs: number;
  isEnabled: boolean;
}

// --- Module A: DataGhost message types ---

export interface NoiseInjectedMessage {
  type: "NOISE_INJECTED";
  payload: {
    keyword: string;
    category: string;
    timestamp: number;
  };
}

export interface TriggerNoiseMessage {
  type: "TRIGGER_NOISE";
}

export interface GetStatusMessage {
  type: "GET_STATUS";
}

export interface SetNoiseEnabledMessage {
  type: "SET_NOISE_ENABLED";
  payload: { enabled: boolean };
}

export type BackgroundInboundMessage =
  | TriggerNoiseMessage
  | GetStatusMessage
  | SetNoiseEnabledMessage;

export type BackgroundOutboundMessage = NoiseInjectedMessage;

export interface DataGhostStatus {
  noiseGeneratedCount: number;
  isNoiseEnabled: boolean;
}