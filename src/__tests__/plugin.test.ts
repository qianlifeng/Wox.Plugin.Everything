import { Context, PluginInitParams, Query, WoxImage } from "@wox-launcher/wox-plugin"
import { createPlugin } from "../index"

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
    const api = {
      Log: jest.fn().mockResolvedValue(undefined),
      OnUnload: jest.fn().mockImplementation(async (_ctx, callback) => {
        onUnload.mockImplementation(callback)
      })
    }

    await currentPlugin.init(ctx, {
      API: api as never,
      PluginDirectory: "C:\\Plugins\\Everything"
    } as unknown as PluginInitParams)

    expect(startEverythingBackendRefresh).toHaveBeenCalled()
    expect(api.OnUnload).toHaveBeenCalled()

    await onUnload(ctx)

    expect(disposeEverythingSearch).toHaveBeenCalled()
  })

  test("returns empty results for empty search", async () => {
    const searchEverything = jest.fn()
    const openPath = jest.fn()
    const currentPlugin = createPlugin({ searchEverything, openPath })
    const ctx = {} as Context

    const results = await currentPlugin.query(ctx, createQuery(""))

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

    const results = await currentPlugin.query(ctx, createQuery("file"))

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

  test("returns an explanatory error result when Everything is unavailable", async () => {
    const searchEverything = jest.fn().mockRejectedValue(new Error("Everything unavailable"))
    const currentPlugin = createPlugin({ searchEverything, openPath: jest.fn() })
    const ctx = {} as Context

    const results = await currentPlugin.query(ctx, createQuery("file"))

    expect(results).toHaveLength(1)
    expect(results[0]?.Title).toBe("i18n:search_error")
    expect(results[0]?.SubTitle).toContain("Everything unavailable")
  })
})
