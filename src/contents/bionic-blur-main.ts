import type { PlasmoCSConfig } from "plasmo"

import {
  DEFAULT_BIONIC_BLUR_CONFIG,
  buildPrivacyProfile,
  getBlurredPointerFields,
  getCoarseTimestamp,
  normalizeOrigin,
  shouldProtectHost
} from "../shared/bionicBlurCore"
import type {
  BionicBlurConfig,
  FingerprintSurface,
  PointerLikeFields,
  PrivacyProfile
} from "../types"

export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  run_at: "document_start",
  all_frames: true,
  world: "MAIN"
}

const CHANNEL = "cloak-dagger:bionic-blur"
const MAIN_TO_BRIDGE = "main-to-bridge"
const BRIDGE_TO_MAIN = "bridge-to-main"
const INSTALL_FLAG = "__cloakDaggerBionicBlurInstalled"
const TELEMETRY_FLUSH_MS = 1200
const POINTER_EVENTS = new Set(["mousemove", "pointermove", "pointerrawupdate"])
const KEY_EVENTS = new Set(["keydown", "keyup", "beforeinput", "input"])
const SENSOR_EVENTS = new Set(["devicemotion", "deviceorientation"])

type TelemetryAction = "patched" | "blurred" | "blocked" | "configured" | "proof"

interface TelemetryBucket {
  surface: FingerprintSurface
  action: TelemetryAction
  count: number
  metrics?: Record<string, number | string | boolean>
}

interface BridgeConfigMessage {
  source: typeof CHANNEL
  direction: typeof BRIDGE_TO_MAIN
  type: "BIONIC_BLUR_CONFIG"
  payload: {
    config: BionicBlurConfig
    profileSeed: string
  }
}

const windowState = window as typeof window & Record<string, unknown>

if (!windowState[INSTALL_FLAG]) {
  windowState[INSTALL_FLAG] = true
  installBionicBlur()
}

function installBionicBlur(): void {
  let activeConfig: BionicBlurConfig = {
    ...DEFAULT_BIONIC_BLUR_CONFIG,
    debugMode:
      location.hostname === "localhost" || location.hostname === "127.0.0.1"
  }
  let profile: PrivacyProfile = buildPrivacyProfile(location.href, "boot")
  const telemetry = new Map<string, TelemetryBucket>()
  const keyboardTimestamps = new WeakMap<Event, number>()

  const emitTelemetry = (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count = 1,
    metrics?: Record<string, number | string | boolean>
  ) => {
    const key = `${surface}:${action}`
    const existing = telemetry.get(key)
    if (existing) {
      existing.count += count
      existing.metrics = { ...existing.metrics, ...metrics }
      return
    }
    telemetry.set(key, { surface, action, count, metrics })
  }

  const flushTelemetry = () => {
    if (telemetry.size === 0) return
    const payload = Array.from(telemetry.values()).map((entry) => ({
      ...entry,
      timestamp: Date.now()
    }))
    telemetry.clear()
    window.postMessage(
      {
        source: CHANNEL,
        direction: MAIN_TO_BRIDGE,
        type: "BIONIC_BLUR_TELEMETRY",
        payload
      },
      "*"
    )
  }

  setInterval(flushTelemetry, TELEMETRY_FLUSH_MS)

  const isActive = () =>
    shouldProtectHost(activeConfig, location.hostname || normalizeOrigin(location.href))

  const updateConfig = (message: BridgeConfigMessage) => {
    activeConfig = {
      ...DEFAULT_BIONIC_BLUR_CONFIG,
      ...message.payload.config
    }
    profile = buildPrivacyProfile(location.href, message.payload.profileSeed)
    emitTelemetry("event-listener", "configured", 1)
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data as Partial<BridgeConfigMessage> | undefined
    if (
      data?.source === CHANNEL &&
      data.direction === BRIDGE_TO_MAIN &&
      data.type === "BIONIC_BLUR_CONFIG" &&
      data.payload?.config &&
      data.payload.profileSeed
    ) {
      updateConfig(data as BridgeConfigMessage)
    }
  })

  patchEventListeners(
    () => activeConfig,
    () => profile,
    isActive,
    keyboardTimestamps,
    emitTelemetry,
    emitDebugEvent
  )
  patchKeyboardTimestampGetter(() => activeConfig, isActive, keyboardTimestamps)
  patchFingerprintSurfaces(
    () => activeConfig,
    () => profile,
    isActive,
    emitTelemetry
  )

  function emitDebugEvent(
    surface: FingerprintSurface,
    detail: Record<string, unknown>
  ): void {
    if (!activeConfig.debugMode) return
    window.dispatchEvent(
      new CustomEvent("cloak-dagger-bionic-debug", {
        detail: {
          surface,
          timestamp: Date.now(),
          ...detail
        }
      })
    )
  }
}

function patchEventListeners(
  getConfig: () => BionicBlurConfig,
  getProfile: () => PrivacyProfile,
  isActive: () => boolean,
  keyboardTimestamps: WeakMap<Event, number>,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number,
    metrics?: Record<string, number | string | boolean>
  ) => void,
  emitDebugEvent: (
    surface: FingerprintSurface,
    detail: Record<string, unknown>
  ) => void
): void {
  const originalAdd = EventTarget.prototype.addEventListener
  const originalRemove = EventTarget.prototype.removeEventListener
  const wrappedListeners = new WeakMap<object, Map<string, EventListener>>()

  const wrapListener = (
    type: string,
    listener: EventListenerOrEventListenerObject,
    capture: boolean
  ): EventListenerOrEventListenerObject => {
    if (listener == null) return listener
    if (!shouldWrapEvent(type)) return listener

    const listenerObject = listener as object
    const key = `${type}:${capture}`
    const existing = wrappedListeners.get(listenerObject)?.get(key)
    if (existing) return existing

    const wrapped: EventListener = function wrappedBionicBlurListener(
      this: EventTarget,
      event
    ) {
      const protectedEvent = protectEvent(
        type,
        event,
        getConfig(),
        getProfile(),
        isActive(),
        keyboardTimestamps,
        emitTelemetry,
        emitDebugEvent
      )

      if (typeof listener === "function") {
        return listener.call(this, protectedEvent)
      }
      return listener.handleEvent(protectedEvent)
    }

    const perListener = wrappedListeners.get(listenerObject) ?? new Map()
    perListener.set(key, wrapped)
    wrappedListeners.set(listenerObject, perListener)
    return wrapped
  }

  EventTarget.prototype.addEventListener = function patchedAddEventListener(
    type,
    listener,
    options
  ) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture)
    const wrapped = listener ? wrapListener(type, listener, capture) : listener
    return originalAdd.call(this, type, wrapped, options)
  }

  EventTarget.prototype.removeEventListener = function patchedRemoveEventListener(
    type,
    listener,
    options
  ) {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture)
    const wrapped =
      listener && wrappedListeners.get(listener as object)?.get(`${type}:${capture}`)
    return originalRemove.call(this, type, wrapped ?? listener, options)
  }

  patchPropertyHandlers(originalAdd, originalRemove, wrapListener)
  emitTelemetry("event-listener", "patched", 1)
}

function shouldWrapEvent(type: string): boolean {
  return POINTER_EVENTS.has(type) || KEY_EVENTS.has(type) || SENSOR_EVENTS.has(type)
}

function protectEvent(
  type: string,
  event: Event,
  config: BionicBlurConfig,
  profile: PrivacyProfile,
  active: boolean,
  keyboardTimestamps: WeakMap<Event, number>,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number,
    metrics?: Record<string, number | string | boolean>
  ) => void,
  emitDebugEvent: (
    surface: FingerprintSurface,
    detail: Record<string, unknown>
  ) => void
): Event {
  if (!active) return event

  if (POINTER_EVENTS.has(type) && config.mouseEnabled && isPointerLike(event)) {
    const raw = extractPointerFields(event)
    const blurred = getBlurredPointerFields(raw, profile, {
      mouseIntensity: config.mouseIntensity,
      timestampJitterMs: config.timestampJitterMs
    })
    const timestamp = getCoarseTimestamp(
      event.timeStamp,
      profile,
      config.timestampJitterMs
    )

    emitTelemetry("mouse", "blurred", 1)
    emitDebugEvent("mouse", { raw, blurred, timestamp })

    return makeEventProxy(event, {
      ...blurred,
      timeStamp: timestamp,
      getCoalescedEvents: () => [
        makeEventProxy(event, blurred as unknown as Record<string, unknown>)
      ]
    })
  }

  if (KEY_EVENTS.has(type) && config.keyboardEnabled) {
    const timestamp = getCoarseTimestamp(
      event.timeStamp,
      profile,
      config.timestampJitterMs
    )
    keyboardTimestamps.set(event, timestamp)
    emitTelemetry("keyboard", "blurred", 1)
    emitDebugEvent("keyboard", { rawTimeStamp: event.timeStamp, timestamp })
    return event
  }

  if (SENSOR_EVENTS.has(type)) {
    const timestamp = getCoarseTimestamp(
      event.timeStamp,
      profile,
      config.timestampJitterMs
    )
    emitTelemetry("sensors", "blurred", 1)
    return makeEventProxy(event, { timeStamp: timestamp })
  }

  return event
}

function makeEventProxy<T extends Event>(
  event: T,
  overrides: Record<string, unknown>
): T {
  return new Proxy(event, {
    get(target, prop) {
      if (typeof prop === "string" && prop in overrides) {
        return overrides[prop]
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === "function" ? value.bind(target) : value
    }
  })
}

function patchKeyboardTimestampGetter(
  getConfig: () => BionicBlurConfig,
  isActive: () => boolean,
  keyboardTimestamps: WeakMap<Event, number>
): void {
  const descriptor = Object.getOwnPropertyDescriptor(Event.prototype, "timeStamp")
  if (!descriptor?.get || descriptor.configurable === false) return

  try {
    Object.defineProperty(Event.prototype, "timeStamp", {
      configurable: true,
      enumerable: descriptor.enumerable,
      get() {
        const event = this as Event
        const masked = keyboardTimestamps.get(event)
        if (masked !== undefined && isActive() && getConfig().keyboardEnabled) {
          return masked
        }
        return descriptor.get?.call(event)
      }
    })
  } catch {
    // Keep keyboard events pass-through if this browser locks Event internals.
  }
}

function isPointerLike(event: Event): event is MouseEvent {
  return (
    "clientX" in event &&
    "clientY" in event &&
    "pageX" in event &&
    "pageY" in event
  )
}

function extractPointerFields(event: MouseEvent): PointerLikeFields {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
    movementX: event.movementX,
    movementY: event.movementY
  }
}

function patchPropertyHandlers(
  originalAdd: typeof EventTarget.prototype.addEventListener,
  originalRemove: typeof EventTarget.prototype.removeEventListener,
  wrapListener: (
    type: string,
    listener: EventListenerOrEventListenerObject,
    capture: boolean
  ) => EventListenerOrEventListenerObject
): void {
  const targets = [Window.prototype, Document.prototype, HTMLElement.prototype]
  const properties: Array<[string, string]> = [
    ["onmousemove", "mousemove"],
    ["onpointermove", "pointermove"],
    ["onkeydown", "keydown"],
    ["onkeyup", "keyup"],
    ["onbeforeinput", "beforeinput"],
    ["oninput", "input"]
  ]

  for (const proto of targets) {
    for (const [property, type] of properties) {
      try {
        const assigned = new WeakMap<EventTarget, EventListenerOrEventListenerObject>()
        Object.defineProperty(proto, property, {
          configurable: true,
          get() {
            return assigned.get(this as EventTarget) ?? null
          },
          set(listener: EventListenerOrEventListenerObject | null) {
            const previous = assigned.get(this as EventTarget)
            if (previous) {
              originalRemove.call(this, type, previous, false)
            }
            if (!listener) {
              assigned.delete(this as EventTarget)
              return
            }
            const wrapped = wrapListener(type, listener, false)
            assigned.set(this as EventTarget, wrapped)
            originalAdd.call(this, type, wrapped, false)
          }
        })
      } catch {
        // Some host objects lock handler descriptors. Ignore and keep addEventListener patch.
      }
    }
  }
}

function patchFingerprintSurfaces(
  getConfig: () => BionicBlurConfig,
  getProfile: () => PrivacyProfile,
  isActive: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number,
    metrics?: Record<string, number | string | boolean>
  ) => void
): void {
  const shouldPatch = () => isActive() && getConfig().fingerprintEnabled
  patchNavigator(getProfile, shouldPatch, emitTelemetry)
  patchTimezone(getProfile, shouldPatch, emitTelemetry)
  patchScreen(getProfile, shouldPatch, emitTelemetry)
  patchCanvas(getProfile, shouldPatch, emitTelemetry)
  patchWebGL(getProfile, shouldPatch, emitTelemetry)
  patchAudio(getProfile, shouldPatch, emitTelemetry)
  patchPermissions(shouldPatch, emitTelemetry)
  patchMediaDevices(shouldPatch, emitTelemetry)
  patchBattery(shouldPatch, emitTelemetry)
  patchNetworkInfo(getProfile, shouldPatch, emitTelemetry)
  patchTiming(getProfile, shouldPatch, emitTelemetry)
}

function defineGetter(
  target: object,
  property: string,
  getter: () => unknown
): void {
  try {
    Object.defineProperty(target, property, {
      configurable: true,
      get: getter
    })
  } catch {
    // Read-only browser internals are allowed to resist. Best effort only.
  }
}

function patchNavigator(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const proto = Navigator.prototype as Navigator & Record<string, unknown>
  defineGetter(proto, "platform", () =>
    shouldPatch() ? getProfile().platform : navigator.platform
  )
  defineGetter(proto, "language", () =>
    shouldPatch() ? getProfile().locale : navigator.language
  )
  defineGetter(proto, "languages", () =>
    shouldPatch() ? [getProfile().locale, "en-US", "en"] : navigator.languages
  )
  defineGetter(proto, "hardwareConcurrency", () =>
    shouldPatch() ? getProfile().hardwareConcurrency : navigator.hardwareConcurrency
  )
  defineGetter(proto, "deviceMemory", () =>
    shouldPatch()
      ? getProfile().deviceMemory
      : (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  )
  defineGetter(proto, "maxTouchPoints", () =>
    shouldPatch() ? getProfile().maxTouchPoints : navigator.maxTouchPoints
  )

  const uaData = (navigator as Navigator & { userAgentData?: unknown }).userAgentData
  if (uaData && typeof uaData === "object") {
    const data = uaData as Record<string, unknown>
    const originalHighEntropy = data.getHighEntropyValues
    if (typeof originalHighEntropy === "function") {
      data.getHighEntropyValues = async function patchedHighEntropy(
        hints: string[]
      ) {
        const result = await originalHighEntropy.call(this, hints)
        if (!shouldPatch()) return result
        return {
          ...result,
          platform: getProfile().platform.includes("Mac")
            ? "macOS"
            : getProfile().platform.includes("Linux")
              ? "Linux"
              : "Windows",
          architecture: "x86",
          bitness: "64",
          mobile: false
        }
      }
    }
  }

  emitTelemetry("navigator", "patched", 1)
}

function patchTimezone(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions
  Intl.DateTimeFormat.prototype.resolvedOptions = function patchedResolvedOptions() {
    const result = originalResolvedOptions.call(this)
    return shouldPatch() ? { ...result, timeZone: getProfile().timezone } : result
  }

  const originalOffset = Date.prototype.getTimezoneOffset
  Date.prototype.getTimezoneOffset = function patchedTimezoneOffset() {
    return shouldPatch()
      ? getProfile().timezoneOffsetMinutes
      : originalOffset.call(this)
  }

  emitTelemetry("timezone", "patched", 1)
}

function patchScreen(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const proto = Screen.prototype
  defineGetter(proto, "width", () =>
    shouldPatch() ? getProfile().screen.width : screen.width
  )
  defineGetter(proto, "height", () =>
    shouldPatch() ? getProfile().screen.height : screen.height
  )
  defineGetter(proto, "availWidth", () =>
    shouldPatch() ? getProfile().screen.width : screen.availWidth
  )
  defineGetter(proto, "availHeight", () =>
    shouldPatch() ? getProfile().screen.height - 40 : screen.availHeight
  )
  defineGetter(proto, "colorDepth", () =>
    shouldPatch() ? getProfile().screen.colorDepth : screen.colorDepth
  )
  defineGetter(proto, "pixelDepth", () =>
    shouldPatch() ? getProfile().screen.colorDepth : screen.pixelDepth
  )
  defineGetter(window, "devicePixelRatio", () => (shouldPatch() ? 1 : devicePixelRatio))

  emitTelemetry("screen", "patched", 1)
}

function patchCanvas(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const proto = CanvasRenderingContext2D.prototype
  const originalGetImageData = proto.getImageData
  proto.getImageData = function patchedGetImageData(...args) {
    const data = originalGetImageData.apply(this, args)
    if (!shouldPatch()) return data
    addPixelNoise(data.data, getProfile().seed)
    emitTelemetry("canvas", "blurred", 1)
    return data
  }

  const originalMeasureText = proto.measureText
  proto.measureText = function patchedMeasureText(text) {
    const metrics = originalMeasureText.call(this, text)
    if (!shouldPatch()) return metrics
    const widthDelta = (getProfile().hardwareConcurrency % 3) * 0.017
    return new Proxy(metrics, {
      get(target, prop) {
        if (prop === "width") return target.width + widthDelta
        const value = Reflect.get(target, prop, target)
        return typeof value === "function" ? value.bind(target) : value
      }
    })
  }

  emitTelemetry("canvas", "patched", 1)
  emitTelemetry("fonts", "patched", 1)
}

function patchWebGL(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const debugVendor = 37445
  const debugRenderer = 37446

  const patchPrototype = (proto: WebGLRenderingContext | WebGL2RenderingContext) => {
    const originalGetParameter = proto.getParameter
    proto.getParameter = function patchedGetParameter(parameter) {
      if (shouldPatch()) {
        if (parameter === debugVendor) return getProfile().webglVendor
        if (parameter === debugRenderer) return getProfile().webglRenderer
      }
      return originalGetParameter.call(this, parameter)
    }

    const originalGetExtension = proto.getExtension
    proto.getExtension = function patchedGetExtension(name) {
      if (shouldPatch() && name === "WEBGL_debug_renderer_info") {
        return {
          UNMASKED_VENDOR_WEBGL: debugVendor,
          UNMASKED_RENDERER_WEBGL: debugRenderer
        } as WEBGL_debug_renderer_info
      }
      return originalGetExtension.call(this, name)
    }

    const originalReadPixels = proto.readPixels
    proto.readPixels = function patchedReadPixels(...args: Parameters<WebGLRenderingContext["readPixels"]>) {
      const result = originalReadPixels.apply(this, args)
      if (shouldPatch()) {
        const pixels = args[6]
        if (ArrayBuffer.isView(pixels)) {
          addPixelNoise(pixels as Uint8Array | Uint8ClampedArray, getProfile().seed)
          emitTelemetry("webgl", "blurred", 1)
        }
      }
      return result
    }
  }

  try {
    patchPrototype(WebGLRenderingContext.prototype)
    if ("WebGL2RenderingContext" in window) {
      patchPrototype(WebGL2RenderingContext.prototype)
    }
    emitTelemetry("webgl", "patched", 1)
  } catch {
    // WebGL can be disabled by policy or missing in some contexts.
  }
}

function addPixelNoise(
  data: Uint8Array | Uint8ClampedArray,
  seed: string
): void {
  const direction = (seed.length % 2 === 0 ? 1 : -1) as 1 | -1
  for (let i = 0; i < data.length; i += 97) {
    data[i] = Math.max(0, Math.min(255, data[i] + direction))
  }
}

function patchAudio(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const originalGetChannelData = AudioBuffer.prototype.getChannelData
  AudioBuffer.prototype.getChannelData = function patchedGetChannelData(channel) {
    const data = originalGetChannelData.call(this, channel)
    if (!shouldPatch()) return data
    const offset = (getProfile().hardwareConcurrency % 5) * 0.0000001
    for (let i = 0; i < data.length; i += 113) {
      data[i] += offset
    }
    emitTelemetry("audio", "blurred", 1)
    return data
  }

  emitTelemetry("audio", "patched", 1)
}

function patchPermissions(
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  if (!navigator.permissions?.query) return
  const originalQuery = navigator.permissions.query.bind(navigator.permissions)
  navigator.permissions.query = async function patchedPermissionsQuery(descriptor) {
    const result = await originalQuery(descriptor)
    if (!shouldPatch()) return result
    const name = String(descriptor.name)
    if (["camera", "microphone", "geolocation", "notifications"].includes(name)) {
      emitTelemetry("permissions", "blocked", 1)
      return new Proxy(result, {
        get(target, prop) {
          if (prop === "state") return "prompt"
          const value = Reflect.get(target, prop, target)
          return typeof value === "function" ? value.bind(target) : value
        }
      })
    }
    return result
  }
  emitTelemetry("permissions", "patched", 1)
}

function patchMediaDevices(
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  if (!navigator.mediaDevices?.enumerateDevices) return
  const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(
    navigator.mediaDevices
  )
  navigator.mediaDevices.enumerateDevices = async function patchedEnumerateDevices() {
    const devices = await originalEnumerate()
    if (!shouldPatch()) return devices
    emitTelemetry("media-devices", "blocked", 1)
    return devices.slice(0, 2).map((device, index) => ({
      ...device,
      deviceId: `default-${index}`,
      groupId: "default",
      label: ""
    }))
  }
  emitTelemetry("media-devices", "patched", 1)
}

function patchBattery(
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const nav = navigator as Navigator & { getBattery?: () => Promise<unknown> }
  if (!nav.getBattery) return
  nav.getBattery = async function patchedBattery() {
    if (!shouldPatch()) return { charging: true, level: 1 }
    emitTelemetry("battery", "blocked", 1)
    return {
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false
    }
  }
  emitTelemetry("battery", "patched", 1)
}

function patchNetworkInfo(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  defineGetter(Navigator.prototype, "connection", () => {
    if (!shouldPatch()) {
      return (navigator as Navigator & { connection?: unknown }).connection
    }
    return {
      effectiveType: "4g",
      downlink: getProfile().hardwareConcurrency,
      rtt: 75,
      saveData: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    }
  })
  emitTelemetry("network-info", "patched", 1)
}

function patchTiming(
  getProfile: () => PrivacyProfile,
  shouldPatch: () => boolean,
  emitTelemetry: (
    surface: FingerprintSurface,
    action: TelemetryAction,
    count?: number
  ) => void
): void {
  const originalPerformanceNow = performance.now.bind(performance)
  try {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: () => {
        const value = originalPerformanceNow()
        return shouldPatch()
          ? getCoarseTimestamp(value, getProfile(), 3)
          : value
      }
    })
  } catch {
    // Some browsers lock performance.now.
  }

  const originalDateNow = Date.now.bind(Date)
  Date.now = () => {
    const value = originalDateNow()
    return shouldPatch() ? Math.round(value / 4) * 4 : value
  }

  const originalRaf = requestAnimationFrame.bind(window)
  window.requestAnimationFrame = (callback) =>
    originalRaf((timestamp) =>
      callback(
        shouldPatch() ? getCoarseTimestamp(timestamp, getProfile(), 3) : timestamp
      )
    )

  emitTelemetry("timing", "patched", 1)
}
