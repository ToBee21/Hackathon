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