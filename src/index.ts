import path from "path"
import { Context, Plugin, PluginInitParams, PublicAPI, Query, Result, WoxImage } from "@wox-launcher/wox-plugin"
import { configureEverythingSearch, disposeEverythingSearch, EverythingSearchTrace, searchEverything, startEverythingBackendRefresh } from "./everything/search"
import { EverythingSearchResult } from "./everything/types"
import { openContainingFolder, openPath } from "./open"

const DEFAULT_LIMIT = 30
const SLOW_QUERY_LOG_MS = 150
const IMAGE_THUMBNAIL_EXTENSIONS = new Set([".avif", ".bmp", ".gif", ".heic", ".heif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".tif", ".tiff", ".webp"])

interface PluginDeps {
  searchEverything: (search: string, limit: number, trace?: EverythingSearchTrace) => Promise<EverythingSearchResult[]>
  openPath: (targetPath: string) => Promise<void>
  openContainingFolder: (targetPath: string) => Promise<void>
  startEverythingBackendRefresh: () => void
  disposeEverythingSearch: () => void
}

function createErrorResult(message: string): Result {
  return {
    Title: "i18n:search_error",
    SubTitle: message,
    Icon: {
      ImageType: "relative",
      ImageData: "images/app.png"
    },
    Actions: []
  }
}

function shouldUseImageThumbnail(filePath: string): boolean {
  return IMAGE_THUMBNAIL_EXTENSIONS.has(path.win32.extname(filePath).toLowerCase())
}

function createFileIcon(): WoxImage {
  return {
    ImageType: "emoji",
    ImageData: "📄"
  }
}

function createFolderIcon(): WoxImage {
  return {
    ImageType: "emoji",
    ImageData: "📁"
  }
}

function createResultIcon(entry: EverythingSearchResult): WoxImage {
  if (entry.isDirectory) {
    return createFolderIcon()
  }

  if (!entry.isDirectory && shouldUseImageThumbnail(entry.path)) {
    return {
      ImageType: "absolute",
      ImageData: entry.path
    }
  }

  return createFileIcon()
}

async function logQueryDiagnostics(
  api: PublicAPI | undefined,
  ctx: Context,
  search: string,
  elapsedMs: number,
  resultCount: number,
  trace: EverythingSearchTrace,
  errorMessage?: string
): Promise<void> {
  if (!api) {
    return
  }

  const reason = errorMessage ? `error=${JSON.stringify(errorMessage)}` : `results=${resultCount}`
  const traceSummary = trace.events.length > 0 ? trace.events.join(" | ") : "none"
  const backend = trace.backend ?? "unknown"
  await api.Log(ctx, errorMessage ? "Error" : "Info", `Everything query diagnostics search=${JSON.stringify(search)} elapsed=${elapsedMs}ms backend=${backend} ${reason} trace=${traceSummary}`)
}

export function createPlugin(overrides: Partial<PluginDeps> = {}): Plugin {
  let api: PublicAPI | undefined
  const deps: PluginDeps = {
    searchEverything,
    openPath,
    openContainingFolder,
    startEverythingBackendRefresh,
    disposeEverythingSearch,
    ...overrides
  }

  return {
    init: async (ctx: Context, initParams: PluginInitParams) => {
      api = initParams.API
      configureEverythingSearch(initParams.PluginDirectory)
      deps.startEverythingBackendRefresh()
      await api.OnUnload(ctx, async (unloadCtx: Context) => {
        deps.disposeEverythingSearch()
        await api?.Log(unloadCtx, "Info", "Everything plugin unloaded")
      })
      await api.Log(ctx, "Info", "Everything plugin initialized")
    },

    query: async (ctx: Context, query: Query): Promise<Result[]> => {
      if (!query.Search.trim()) {
        return []
      }

      const trace: EverythingSearchTrace = { events: [] }
      const startedAt = Date.now()
      try {
        const entries = await deps.searchEverything(query.Search, DEFAULT_LIMIT, trace)
        const elapsedMs = Date.now() - startedAt
        if (elapsedMs >= SLOW_QUERY_LOG_MS) {
          await logQueryDiagnostics(api, ctx, query.Search, elapsedMs, entries.length, trace)
        }
        return entries.map((entry: EverythingSearchResult, index: number) => ({
          Title: path.win32.basename(entry.path),
          SubTitle: entry.path,
          Score: entries.length - index,
          Icon: createResultIcon(entry),
          ContextData: {
            path: entry.path
          },
          Actions: [
            {
              Id: "open",
              Name: "i18n:open",
              IsDefault: true,
              ContextData: {
                path: entry.path
              },
              Action: async (_actionCtx: Context, actionContext) => {
                await deps.openPath(actionContext.ContextData.path)
              }
            },
            {
              Id: "open-containing-folder",
              Name: "i18n:open_containing_folder",
              Hotkey: "ctrl+enter",
              ContextData: {
                path: entry.path
              },
              Action: async (_actionCtx: Context, actionContext) => {
                await deps.openContainingFolder(actionContext.ContextData.path)
              }
            }
          ]
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const elapsedMs = Date.now() - startedAt
        if (api) {
          await logQueryDiagnostics(api, ctx, query.Search, elapsedMs, 0, trace, message)
          await api.Log(ctx, "Error", message)
        }
        return [createErrorResult(message)]
      }
    }
  }
}

export const plugin = createPlugin()
