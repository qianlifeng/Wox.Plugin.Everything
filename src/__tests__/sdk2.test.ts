import koffi from "koffi"
import { disposeSdk2, searchWithSdk2 } from "../everything/sdk2"

jest.mock("koffi", () => ({
  __esModule: true,
  default: {
    load: jest.fn()
  }
}))

describe("searchWithSdk2", () => {
  afterEach(() => {
    disposeSdk2()
    jest.clearAllMocks()
  })

  test("does not explicitly set sort because Everything 1.4 defaults to name ascending", async () => {
    const setSort = jest.fn()
    const setOffset = jest.fn()
    const library = {
      func: jest.fn((signature: string) => {
        if (signature.includes("Everything_SetSort")) {
          return setSort
        }
        if (signature.includes("Everything_SetOffset")) {
          return setOffset
        }
        if (signature.includes("Everything_QueryW")) {
          return jest.fn().mockReturnValue(1)
        }
        if (signature.includes("Everything_GetNumResults")) {
          return jest.fn().mockReturnValue(0)
        }
        if (signature.includes("Everything_GetLastError")) {
          return jest.fn().mockReturnValue(0)
        }
        return jest.fn()
      }),
      unload: jest.fn()
    }

    ;(koffi.load as jest.Mock).mockReturnValue(library)

    await searchWithSdk2("C:\\Plugins\\Everything\\native", "test data", 30)

    expect(setOffset).toHaveBeenCalledWith(0)
    expect(setSort).not.toHaveBeenCalled()
  })

  test("binds Everything 1.4 BOOL parameters as int values", async () => {
    const setMatchPath = jest.fn()
    const setMatchCase = jest.fn()
    const setMatchWholeWord = jest.fn()
    const setRegex = jest.fn()
    const query = jest.fn().mockReturnValue(1)
    const signatures: string[] = []
    const library = {
      func: jest.fn((signature: string) => {
        signatures.push(signature)
        if (signature.includes("Everything_SetMatchPath")) {
          return setMatchPath
        }
        if (signature.includes("Everything_SetMatchCase")) {
          return setMatchCase
        }
        if (signature.includes("Everything_SetMatchWholeWord")) {
          return setMatchWholeWord
        }
        if (signature.includes("Everything_SetRegex")) {
          return setRegex
        }
        if (signature.includes("Everything_QueryW")) {
          return query
        }
        if (signature.includes("Everything_GetNumResults")) {
          return jest.fn().mockReturnValue(0)
        }
        if (signature.includes("Everything_GetLastError")) {
          return jest.fn().mockReturnValue(0)
        }
        return jest.fn()
      }),
      unload: jest.fn()
    }

    ;(koffi.load as jest.Mock).mockReturnValue(library)

    await searchWithSdk2("C:\\Plugins\\Everything\\native", "test data", 30)

    expect(signatures).toContain("void __stdcall Everything_SetMatchPath(int enabled)")
    expect(signatures).toContain("void __stdcall Everything_SetMatchCase(int enabled)")
    expect(signatures).toContain("void __stdcall Everything_SetMatchWholeWord(int enabled)")
    expect(signatures).toContain("void __stdcall Everything_SetRegex(int enabled)")
    expect(signatures).toContain("int __stdcall Everything_QueryW(int waitForResults)")
    expect(signatures).toContain("int __stdcall Everything_IsFolderResult(uint32_t index)")
    expect(signatures.some(signature => signature.includes("bool enabled") || signature.includes("bool waitForResults"))).toBe(false)
    expect(setMatchPath).toHaveBeenCalledWith(0)
    expect(setMatchCase).toHaveBeenCalledWith(0)
    expect(setMatchWholeWord).toHaveBeenCalledWith(0)
    expect(setRegex).toHaveBeenCalledWith(0)
    expect(query).toHaveBeenCalledWith(1)
  })
})
