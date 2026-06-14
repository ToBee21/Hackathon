const EXPLICIT_USER_ACTION_ENDPOINTS = [
  "https://app.simplelogin.io/api/alias/random/new"
] as const

const USER_ENABLED_NOISE_ENDPOINTS = [
  "https://html.duckduckgo.com/html/",
  "https://en.wikipedia.org/w/index.php",
  "https://www.google.com/search"
] as const

export const NETWORK_POLICY = {
  defaultNetworkSilent: true,
  explicitUserActionEndpoints: EXPLICIT_USER_ACTION_ENDPOINTS,
  userEnabledNoiseEndpoints: USER_ENABLED_NOISE_ENDPOINTS,
  forbiddenDemoEndpoints: ["https://www.google-analytics.com/g/collect"]
} as const

export function isExplicitUserActionEndpoint(url: string): boolean {
  return EXPLICIT_USER_ACTION_ENDPOINTS.some((allowed) => url.startsWith(allowed))
}

export function isUserEnabledNoiseEndpoint(url: string): boolean {
  return USER_ENABLED_NOISE_ENDPOINTS.some((allowed) => url.startsWith(allowed))
}
