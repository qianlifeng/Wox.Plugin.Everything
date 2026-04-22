import path from "path"
import { Context, Plugin, PluginInitParams, PublicAPI, Query, Result, WoxImage } from "@wox-launcher/wox-plugin"
import { configureEverythingSearch, disposeEverythingSearch, searchEverything, startEverythingBackendRefresh } from "./everything/search"
import { EverythingSearchResult } from "./everything/types"
import { openPath } from "./open"

const DEFAULT_LIMIT = 50
const IMAGE_THUMBNAIL_EXTENSIONS = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".heif",
  ".ico",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".tif",
  ".tiff",
  ".webp"
])

interface PluginDeps {
  searchEverything: (search: string, limit: number) => Promise<EverythingSearchResult[]>
  openPath: (targetPath: string) => Promise<void>
  startEverythingBackendRefresh: () => void
  disposeEverythingSearch: () => void
}

function createErrorResult(message: string): Result {
  return {
    Title: "Everything Search Error",
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

function createFileIcon(filePath: string): WoxImage {
  // Wox core supports "fileicon", but the current Node SDK types have not caught up yet.
  return { ImageType: "fileicon", ImageData: filePath } as unknown as WoxImage
}

function createResultIcon(entry: EverythingSearchResult): WoxImage {
  if (!entry.isDirectory && shouldUseImageThumbnail(entry.path)) {
    return {
      ImageType: "absolute",
      ImageData: entry.path
    }
  }

  return createFileIcon(entry.path)
}

export function createPlugin(overrides: Partial<PluginDeps> = {}): Plugin {
  let api: PublicAPI | undefined
  const deps: PluginDeps = {
    searchEverything,
    openPath,
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

      try {
        const entries = await deps.searchEverything(query.Search, DEFAULT_LIMIT)
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
              Name: "Open",
              IsDefault: true,
              ContextData: {
                path: entry.path
              },
              Action: async (actionCtx: Context, actionContext) => {
                await deps.openPath(actionContext.ContextData.path)
                if (api) {
                  await api.Log(actionCtx, "Info", `Opened ${actionContext.ContextData.path}`)
                }
              }
            }
          ]
        }))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (api) {
          await api.Log(ctx, "Error", message)
        }
        return [createErrorResult(message)]
      }
    }
  }
}

export const plugin = createPlugin()
