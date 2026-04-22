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
export interface EverythingSearchTrace {
  backend?: EverythingBackend
  events: string[]
}

const BACKEND_REFRESH_INTERVAL_MS = 5 * 60 * 1000

let nativeDirectory = ""
let preferredBackend: EverythingBackend = "unknown"
let backendRefreshTimer: ReturnType<typeof setInterval> | undefined
let backendRefreshPromise: Promise<EverythingBackend> | undefined

export function configureEverythingSearch(pluginDirectory: string): void {
  nativeDirectory = path.join(pluginDirectory, "native")
  preferredBackend = "unknown"
}

function addTrace(trace: EverythingSearchTrace | undefined, event: string): void {
  if (trace) {
    trace.events.push(event)
  }
}

function formatTraceError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function searchEverything(search: string, limit: number, trace?: EverythingSearchTrace): Promise<EverythingSearchResult[]> {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new EverythingUnavailableError("Everything search only supports Windows x64")
  }
  if (!nativeDirectory) {
    throw new Error("Everything search is not configured")
  }

  return searchEverythingWithBackendCache(
    search,
    limit,
    {
      searchWithSdk3: async (nextSearch: string, nextLimit: number) => {
        const startedAt = Date.now()
        try {
          const results = await searchWithSdk3(nativeDirectory, nextSearch, nextLimit)
          addTrace(trace, `sdk3 search ok ${Date.now() - startedAt}ms results=${results.length}`)
          return results
        } catch (error) {
          addTrace(trace, `sdk3 search error ${Date.now() - startedAt}ms ${formatTraceError(error)}`)
          throw error
        }
      },
      searchWithSdk2: async (nextSearch: string, nextLimit: number) => {
        const startedAt = Date.now()
        try {
          const results = await searchWithSdk2(nativeDirectory, nextSearch, nextLimit)
          addTrace(trace, `sdk2 search ok ${Date.now() - startedAt}ms results=${results.length}`)
          return results
        } catch (error) {
          addTrace(trace, `sdk2 search error ${Date.now() - startedAt}ms ${formatTraceError(error)}`)
          throw error
        }
      },
      probeSdk3: async () => {
        const startedAt = Date.now()
        try {
          const available = await probeSdk3(nativeDirectory)
          addTrace(trace, `sdk3 probe ${available ? "hit" : "miss"} ${Date.now() - startedAt}ms`)
          return available
        } catch (error) {
          addTrace(trace, `sdk3 probe error ${Date.now() - startedAt}ms ${formatTraceError(error)}`)
          throw error
        }
      },
      probeSdk2: async () => {
        const startedAt = Date.now()
        try {
          const available = await probeSdk2(nativeDirectory)
          addTrace(trace, `sdk2 probe ${available ? "hit" : "miss"} ${Date.now() - startedAt}ms`)
          return available
        } catch (error) {
          addTrace(trace, `sdk2 probe error ${Date.now() - startedAt}ms ${formatTraceError(error)}`)
          throw error
        }
      }
    },
    trace
  )
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

export async function refreshEverythingBackend(deps: BackendProbeDeps, trace?: EverythingSearchTrace): Promise<EverythingBackend> {
  if (backendRefreshPromise) {
    addTrace(trace, "backend refresh join")
    return backendRefreshPromise
  }

  backendRefreshPromise = (async () => {
    const startedAt = Date.now()
    preferredBackend = await detectEverythingBackend(deps)
    addTrace(trace, `backend refresh selected=${preferredBackend} ${Date.now() - startedAt}ms`)
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

export async function searchEverythingWithBackendCache(search: string, limit: number, deps: SearchEverythingWithBackendDeps, trace?: EverythingSearchTrace): Promise<EverythingSearchResult[]> {
  let backend = preferredBackend
  if (backend === "unknown") {
    addTrace(trace, "backend cache miss")
    backend = await refreshEverythingBackend(deps, trace)
  } else {
    addTrace(trace, `backend cache hit ${backend}`)
  }
  if (backend === "unknown") {
    if (trace) {
      trace.backend = "unknown"
    }
    throw createBackendUnavailableError()
  }
  if (trace) {
    trace.backend = backend
  }

  try {
    return await searchWithBackend(backend, search, limit, deps)
  } catch (error) {
    if (!(error instanceof EverythingUnavailableError)) {
      throw error
    }

    preferredBackend = "unknown"
    addTrace(trace, `backend retry after ${backend} unavailable`)
    const refreshedBackend = await refreshEverythingBackend(deps, trace)
    if (refreshedBackend === "unknown") {
      if (trace) {
        trace.backend = "unknown"
      }
      throw createBackendUnavailableError()
    }
    if (trace) {
      trace.backend = refreshedBackend
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
