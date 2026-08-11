import { Context, Plugin, PluginInitParams, Query, Result, WoxImage } from "@wox-launcher/wox-plugin"
import { createPlugin, parseResultLimit } from "../index"

function createQuery(search: string): Query {
  return {
    Id: "1",
    Env: { ActiveWindowTitle: "", ActiveWindowPid: 0, ActiveBrowserUrl: "", ActiveWindowIcon: {} as WoxImage },
    RawQuery: `e ${search}`,
    Selection: { Type: "text", Text: "", FilePaths: [] },
    Type: "input",
    Search: search,
    TriggerKeyword: "e",
    Command: "",
    IsGlobalQuery(): boolean {
      return false
    }
  } as Query
}

function createApi(overrides: Record<string, unknown> = {}) {
  return {
    Log: jest.fn().mockResolvedValue(undefined),
    OnUnload: jest.fn().mockResolvedValue(undefined),
    GetSetting: jest.fn().mockResolvedValue("30"),
    OnSettingChanged: jest.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

async function queryResults(plugin: Plugin, ctx: Context, search: string): Promise<Result[]> {
  const result = await plugin.query(ctx, createQuery(search))
  return Array.isArray(result) ? result : result.Results
}

describe("parseResultLimit", () => {
  test("parses valid limits and clamps extremes", () => {
    expect(parseResultLimit("50")).toBe(50)
    expect(parseResultLimit("1")).toBe(1)
    expect(parseResultLimit("1000")).toBe(1000)
    expect(parseResultLimit("1001")).toBe(1000)
    expect(parseResultLimit("0")).toBe(30)
    expect(parseResultLimit("-5")).toBe(30)
    expect(parseResultLimit("abc")).toBe(30)
    expect(parseResultLimit("")).toBe(30)
    expect(parseResultLimit(undefined)).toBe(30)
  })
})

describe("Everything plugin", () => {
  test("disposes loaded libraries on unload", async () => {
    const startEverythingBackendRefresh = jest.fn()
    const disposeEverythingSearch = jest.fn()
    const onUnload = jest.fn()
    const currentPlugin = createPlugin({
      startEverythingBackendRefresh,
      disposeEverythingSearch
    })
    const ctx = {} as Context
    const api = createApi({
      OnUnload: jest.fn().mockImplementation(async (_ctx, callback) => {
        onUnload.mockImplementation(callback)
      })
    })

    await currentPlugin.init(ctx, {
      API: api as never,
      PluginDirectory: "C:\\Plugins\\Everything"
    } as unknown as PluginInitParams)

    expect(startEverythingBackendRefresh).toHaveBeenCalled()
    expect(api.OnUnload).toHaveBeenCalled()
    expect(api.GetSetting).toHaveBeenCalledWith(ctx, "result_limit")
    expect(api.OnSettingChanged).toHaveBeenCalled()

    await onUnload(ctx)

    expect(disposeEverythingSearch).toHaveBeenCalled()
  })

  test("returns empty results for empty search", async () => {
    const searchEverything = jest.fn()
    const openPath = jest.fn()
    const currentPlugin = createPlugin({ searchEverything, openPath })
    const ctx = {} as Context

    const results = await queryResults(currentPlugin, ctx, "")

    expect(results).toEqual([])
    expect(searchEverything).not.toHaveBeenCalled()
    expect(openPath).not.toHaveBeenCalled()
  })

  test("maps search results and opens selected path", async () => {
    const searchEverything = jest.fn().mockResolvedValue([
      { path: "C:\\Docs\\file.txt", isDirectory: false },
      { path: "C:\\Docs\\Folder", isDirectory: true },
      { path: "C:\\Docs\\photo.jpg", isDirectory: false }
    ])
    const openPath = jest.fn().mockResolvedValue(undefined)
    const openContainingFolder = jest.fn().mockResolvedValue(undefined)
    const currentPlugin = createPlugin({ searchEverything, openPath, openContainingFolder })
    const ctx = {} as Context

    const results = await queryResults(currentPlugin, ctx, "file")

    expect(searchEverything).toHaveBeenCalledWith("file", 30, expect.objectContaining({ events: [] }))
    expect(results).toHaveLength(3)
    expect(results[0]?.Title).toBe("file.txt")
    expect(results[0]?.SubTitle).toBe("C:\\Docs\\file.txt")
    expect(results[0]?.Score).toBeGreaterThan(results[1]?.Score ?? 0)
    expect(results[0]?.Icon).toEqual({
      ImageType: "emoji",
      ImageData: "📄"
    })
    expect(results[0]?.Actions?.[0]?.Name).toBe("i18n:open")
    expect(results[0]?.Actions?.[0]?.IsDefault).toBe(true)
    expect(results[1]?.Title).toBe("Folder")
    expect(results[1]?.SubTitle).toBe("C:\\Docs\\Folder")
    expect(results[1]?.Icon).toEqual({
      ImageType: "emoji",
      ImageData: "📁"
    })
    expect(results[2]?.Title).toBe("photo.jpg")
    expect(results[2]?.Icon).toEqual({
      ImageType: "absolute",
      ImageData: "C:\\Docs\\photo.jpg"
    })

    const openAction = results[0]?.Actions?.[0]
    if (!openAction || !("Action" in openAction)) {
      throw new Error("expected execute action")
    }

    await openAction.Action(ctx, {
      ResultId: "1",
      ResultActionId: openAction.Id ?? "open",
      ContextData: openAction.ContextData ?? {}
    })

    expect(openPath).toHaveBeenCalledWith("C:\\Docs\\file.txt")

    const openContainingFolderAction = results[0]?.Actions?.find(action => action.Hotkey?.toLowerCase() === "ctrl+enter")
    if (!openContainingFolderAction || !("Action" in openContainingFolderAction)) {
      throw new Error("expected open containing folder action")
    }

    await openContainingFolderAction.Action(ctx, {
      ResultId: "1",
      ResultActionId: openContainingFolderAction.Id ?? "open-containing-folder",
      ContextData: openContainingFolderAction.ContextData ?? {}
    })

    expect(openContainingFolderAction.Name).toBe("i18n:open_containing_folder")
    expect(openContainingFolder).toHaveBeenCalledWith("C:\\Docs\\file.txt")
  })

  test("uses configured result limit from settings", async () => {
    const searchEverything = jest.fn().mockResolvedValue([])
    let settingChanged: ((ctx: Context, key: string, value: string) => Promise<void>) | undefined
    const currentPlugin = createPlugin({
      searchEverything,
      openPath: jest.fn(),
      startEverythingBackendRefresh: jest.fn(),
      disposeEverythingSearch: jest.fn()
    })
    const ctx = {} as Context
    const api = createApi({
      GetSetting: jest.fn().mockResolvedValue("100"),
      OnSettingChanged: jest.fn().mockImplementation(async (_ctx, callback) => {
        settingChanged = callback
      })
    })

    await currentPlugin.init(ctx, {
      API: api as never,
      PluginDirectory: "C:\\Plugins\\Everything"
    } as unknown as PluginInitParams)

    await queryResults(currentPlugin, ctx, "readme")
    expect(searchEverything).toHaveBeenCalledWith("readme", 100, expect.objectContaining({ events: [] }))

    if (!settingChanged) {
      throw new Error("expected setting changed callback")
    }
    await settingChanged(ctx, "result_limit", "200")
    searchEverything.mockClear()

    await queryResults(currentPlugin, ctx, "readme")
    expect(searchEverything).toHaveBeenCalledWith("readme", 200, expect.objectContaining({ events: [] }))
  })

  test("logs diagnostics when Everything returns no results", async () => {
    const searchEverything = jest.fn().mockResolvedValue([])
    const currentPlugin = createPlugin({
      searchEverything,
      openPath: jest.fn(),
      startEverythingBackendRefresh: jest.fn(),
      disposeEverythingSearch: jest.fn()
    })
    const ctx = {} as Context
    const api = createApi()

    await currentPlugin.init(ctx, {
      API: api as never,
      PluginDirectory: "C:\\Plugins\\Everything"
    } as unknown as PluginInitParams)
    api.Log.mockClear()

    await queryResults(currentPlugin, ctx, "test data")

    expect(api.Log).toHaveBeenCalledWith(ctx, "Info", expect.stringContaining('rawQuery="e test data" search="test data" searchLength=9'))
    expect(api.Log).toHaveBeenCalledWith(ctx, "Info", expect.stringContaining('trigger="e" command=""'))
    expect(api.Log).toHaveBeenCalledWith(ctx, "Info", expect.stringContaining("results=0"))
  })

  test("returns an explanatory error result when Everything is unavailable", async () => {
    const searchEverything = jest.fn().mockRejectedValue(new Error("Everything unavailable"))
    const currentPlugin = createPlugin({ searchEverything, openPath: jest.fn() })
    const ctx = {} as Context

    const results = await queryResults(currentPlugin, ctx, "file")

    expect(results).toHaveLength(1)
    expect(results[0]?.Title).toBe("i18n:search_error")
    expect(results[0]?.SubTitle).toContain("Everything unavailable")
  })
})
