import {
  EverythingUnavailableError,
  refreshEverythingBackend,
  resetEverythingSearchStateForTests,
  searchEverythingWithBackendCache,
  setPreferredEverythingBackendForTests,
  searchEverythingWithFallback
} from "../everything/search"

afterEach(() => {
  resetEverythingSearchStateForTests()
})

describe("searchEverythingWithFallback", () => {
  test("returns sdk3 results without calling sdk2 when sdk3 succeeds", async () => {
    const sdk3Results = [{ path: "C:\\Docs\\file.txt", isDirectory: false }]
    const sdk3 = jest.fn().mockResolvedValue(sdk3Results)
    const sdk2 = jest.fn().mockResolvedValue([{ path: "C:\\Legacy\\file.txt", isDirectory: false }])

    const results = await searchEverythingWithFallback("file", 20, {
      searchWithSdk3: sdk3,
      searchWithSdk2: sdk2
    })

    expect(results).toEqual(sdk3Results)
    expect(sdk3).toHaveBeenCalledWith("file", 20)
    expect(sdk2).not.toHaveBeenCalled()
  })

  test("falls back to sdk2 when sdk3 is unavailable", async () => {
    const sdk3 = jest.fn().mockRejectedValue(new EverythingUnavailableError("sdk3 unavailable"))
    const sdk2Results = [{ path: "C:\\Legacy\\file.txt", isDirectory: false }]
    const sdk2 = jest.fn().mockResolvedValue(sdk2Results)

    const results = await searchEverythingWithFallback("file", 20, {
      searchWithSdk3: sdk3,
      searchWithSdk2: sdk2
    })

    expect(results).toEqual(sdk2Results)
    expect(sdk2).toHaveBeenCalledWith("file", 20)
  })

  test("does not fall back to sdk2 for sdk3 implementation errors", async () => {
    const sdk3Error = new Error("sdk3 binding failed")
    const sdk3 = jest.fn().mockRejectedValue(sdk3Error)
    const sdk2 = jest.fn()

    await expect(
      searchEverythingWithFallback("file", 20, {
        searchWithSdk3: sdk3,
        searchWithSdk2: sdk2
      })
    ).rejects.toThrow("sdk3 binding failed")

    expect(sdk2).not.toHaveBeenCalled()
  })

  test("returns sdk2 error when both sdk3 and sdk2 are unavailable", async () => {
    const sdk3 = jest.fn().mockRejectedValue(new EverythingUnavailableError("sdk3 unavailable"))
    const sdk2 = jest.fn().mockRejectedValue(new EverythingUnavailableError("sdk2 unavailable"))

    await expect(
      searchEverythingWithFallback("file", 20, {
        searchWithSdk3: sdk3,
        searchWithSdk2: sdk2
      })
    ).rejects.toThrow("sdk2 unavailable")
  })
})

describe("refreshEverythingBackend", () => {
  test("selects sdk2 when sdk3 is unavailable", async () => {
    const backend = await refreshEverythingBackend({
      probeSdk3: jest.fn().mockResolvedValue(false),
      probeSdk2: jest.fn().mockResolvedValue(true)
    })

    expect(backend).toBe("sdk2")
  })
})

describe("searchEverythingWithBackendCache", () => {
  test("uses cached sdk2 without trying sdk3 search", async () => {
    setPreferredEverythingBackendForTests("sdk2")
    const sdk2Results = [{ path: "C:\\Legacy\\file.txt", isDirectory: false }]
    const sdk3Search = jest.fn()
    const sdk2Search = jest.fn().mockResolvedValue(sdk2Results)

    const results = await searchEverythingWithBackendCache("file", 20, {
      searchWithSdk3: sdk3Search,
      searchWithSdk2: sdk2Search,
      probeSdk3: jest.fn().mockResolvedValue(false),
      probeSdk2: jest.fn().mockResolvedValue(true)
    })

    expect(results).toEqual(sdk2Results)
    expect(sdk3Search).not.toHaveBeenCalled()
    expect(sdk2Search).toHaveBeenCalledWith("file", 20)
  })

  test("re-probes and switches to sdk2 when cached sdk3 becomes unavailable", async () => {
    setPreferredEverythingBackendForTests("sdk3")
    const sdk2Results = [{ path: "C:\\Legacy\\file.txt", isDirectory: false }]
    const sdk3Search = jest.fn().mockRejectedValue(new EverythingUnavailableError("sdk3 unavailable"))
    const sdk2Search = jest.fn().mockResolvedValue(sdk2Results)

    const results = await searchEverythingWithBackendCache("file", 20, {
      searchWithSdk3: sdk3Search,
      searchWithSdk2: sdk2Search,
      probeSdk3: jest.fn().mockResolvedValue(false),
      probeSdk2: jest.fn().mockResolvedValue(true)
    })

    expect(results).toEqual(sdk2Results)
    expect(sdk3Search).toHaveBeenCalledTimes(1)
    expect(sdk2Search).toHaveBeenCalledWith("file", 20)
  })
})
