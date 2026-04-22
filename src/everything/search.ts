import path from "path"
import { disposeSdk2, probeSdk2, searchWithSdk2 } from "./sdk2"
import { disposeSdk3, probeSdk3, searchWithSdk3 } from "./sdk3"
import { EverythingSearchResult, SearchWithSdk } from "./types"

export class EverythingUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "EverythingUnavailableError"
    Object.setPrototypeOf(this, EverythingUnavailableError.prototype)
  }
}

interface SearchEverythingDeps {
  searchWithSdk3: SearchWithSdk
  searchWithSdk2: SearchWithSdk
}

interface BackendProbeDeps {
  probeSdk3: () => Promise<boolean>
  probeSdk2: () => Promise<boolean>
}

interface SearchEverythingWithBackendDeps extends SearchEverythingDeps, BackendProbeDeps {}

export type EverythingBackend = "sdk3" | "sdk2" | "unknown"

const BACKEND_REFRESH_INTERVAL_MS = 5 * 60 * 1000

let nativeDirectory = ""
let preferredBackend: EverythingBackend = "unknown"
let backendRefreshTimer: ReturnType<typeof setInterval> | undefined
let backendRefreshPromise: Promise<EverythingBackend> | undefined

export function configureEverythingSearch(pluginDirectory: string): void {
  nativeDirectory = path.join(pluginDirectory, "native")
  preferredBackend = "unknown"
}

export async function searchEverything(search: string, limit: number): Promise<EverythingSearchResult[]> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new EverythingUnavailableError("Everything search only supports Windows x64")
  }
  if (!nativeDirectory) {
    throw new Error("Everything search is not configured")
  }

  return searchEverythingWithBackendCache(search, limit, {
    searchWithSdk3: (nextSearch: string, nextLimit: number) => searchWithSdk3(nativeDirectory, nextSearch, nextLimit),
    searchWithSdk2: (nextSearch: string, nextLimit: number) => searchWithSdk2(nativeDirectory, nextSearch, nextLimit),
    probeSdk3: () => probeSdk3(nativeDirectory),
    probeSdk2: () => probeSdk2(nativeDirectory)
  })
}

export async function searchEverythingWithFallback(search: string, limit: number, deps: SearchEverythingDeps): Promise<EverythingSearchResult[]> {
  try {
    return await deps.searchWithSdk3(search, limit)
  } catch (error) {
    if (!(error instanceof EverythingUnavailableError)) {
      throw error
    }
  }

  return deps.searchWithSdk2(search, limit)
}

function createBackendUnavailableError(): EverythingUnavailableError {
  return new EverythingUnavailableError("Everything is not running")
}

async function detectEverythingBackend(deps: BackendProbeDeps): Promise<EverythingBackend> {
  if (await deps.probeSdk3()) {
    return "sdk3"
  }
  if (await deps.probeSdk2()) {
    return "sdk2"
  }
  return "unknown"
}

export async function refreshEverythingBackend(deps: BackendProbeDeps): Promise<EverythingBackend> {
  if (backendRefreshPromise) {
    return backendRefreshPromise
  }

  backendRefreshPromise = (async () => {
    preferredBackend = await detectEverythingBackend(deps)
    return preferredBackend
  })()

  try {
    return await backendRefreshPromise
  } finally {
    backendRefreshPromise = undefined
  }
}

function searchWithBackend(backend: Exclude<EverythingBackend, "unknown">, search: string, limit: number, deps: SearchEverythingDeps): Promise<EverythingSearchResult[]> {
  if (backend === "sdk3") {
    return deps.searchWithSdk3(search, limit)
  }
  return deps.searchWithSdk2(search, limit)
}

export async function searchEverythingWithBackendCache(search: string, limit: number, deps: SearchEverythingWithBackendDeps): Promise<EverythingSearchResult[]> {
  let backend = preferredBackend
  if (backend === "unknown") {
    backend = await refreshEverythingBackend(deps)
  }
  if (backend === "unknown") {
    throw createBackendUnavailableError()
  }

  try {
    return await searchWithBackend(backend, search, limit, deps)
  } catch (error) {
    if (!(error instanceof EverythingUnavailableError)) {
      throw error
    }

    preferredBackend = "unknown"
    const refreshedBackend = await refreshEverythingBackend(deps)
    if (refreshedBackend === "unknown") {
      throw createBackendUnavailableError()
    }

    return searchWithBackend(refreshedBackend, search, limit, deps)
  }
}

export function startEverythingBackendRefresh(): void {
  stopEverythingBackendRefresh()
  if (!nativeDirectory) {
    return
  }

  const deps: BackendProbeDeps = {
    probeSdk3: () => probeSdk3(nativeDirectory),
    probeSdk2: () => probeSdk2(nativeDirectory)
  }

  void refreshEverythingBackend(deps).catch(() => {})
  backendRefreshTimer = setInterval(() => {
    void refreshEverythingBackend(deps).catch(() => {})
  }, BACKEND_REFRESH_INTERVAL_MS)
}

export function stopEverythingBackendRefresh(): void {
  if (backendRefreshTimer) {
    clearInterval(backendRefreshTimer)
    backendRefreshTimer = undefined
  }
}

export function disposeEverythingSearch(): void {
  stopEverythingBackendRefresh()
  nativeDirectory = ""
  preferredBackend = "unknown"
  backendRefreshPromise = undefined
  disposeSdk3()
  disposeSdk2()
}

export function setPreferredEverythingBackendForTests(backend: EverythingBackend): void {
  preferredBackend = backend
}

export function resetEverythingSearchStateForTests(): void {
  disposeEverythingSearch()
}
