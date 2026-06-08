import koffi from "koffi"
import { disposeSdk3, searchWithSdk3 } from "../everything/sdk3"

jest.mock("koffi", () => ({
  __esModule: true,
  default: {
    load: jest.fn()
  }
}))

describe("searchWithSdk3", () => {
  afterEach(() => {
    disposeSdk3()
    jest.clearAllMocks()
  })

  test("does not force regex off because that disables Everything search syntax", async () => {
    const setSearchRegex = jest.fn()
    const searchState = {}
    const client = {}
    const resultList = {}
    const library = {
      func: jest.fn((signature: string) => {
        if (signature.includes("Everything3_ConnectW")) {
          return jest.fn().mockReturnValue(client)
        }
        if (signature.includes("Everything3_CreateSearchState")) {
          return jest.fn().mockReturnValue(searchState)
        }
        if (signature.includes("Everything3_Search")) {
          return jest.fn().mockReturnValue(resultList)
        }
        if (signature.includes("Everything3_GetResultListViewportCount")) {
          return jest.fn().mockReturnValue(0)
        }
        if (signature.includes("Everything3_SetSearchRegex")) {
          return setSearchRegex
        }
        return jest.fn()
      }),
      unload: jest.fn()
    }

    ;(koffi.load as jest.Mock).mockReturnValue(library)

    await searchWithSdk3("C:\\Plugins\\Everything\\native", "ext:pdf test", 30)

    expect(setSearchRegex).not.toHaveBeenCalled()
  })
})
