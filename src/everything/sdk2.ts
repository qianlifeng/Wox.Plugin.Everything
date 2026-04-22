import koffi from "koffi"
import path from "path"
import { EverythingUnavailableError } from "./search"
import { EverythingSearchResult } from "./types"

const EVERYTHING2_ERROR_IPC = 2
const EVERYTHING2_MAX_ALL = 0xffffffff
const EVERYTHING2_REQUEST_FILE_NAME = 0x00000001
const EVERYTHING2_REQUEST_PATH = 0x00000002
const EVERYTHING2_SORT_NAME_ASCENDING = 1
const MAX_PATH_CHARS = 32768

interface Everything2Bindings {
  setSearch: (search: string) => number
  setMatchPath: (enabled: boolean) => void
  setMatchCase: (enabled: boolean) => void
  setMatchWholeWord: (enabled: boolean) => void
  setRegex: (enabled: boolean) => void
  setMax: (max: number) => void
  setSort: (sortType: number) => void
  setRequestFlags: (flags: number) => void
  query: (waitForResults: boolean) => boolean
  getLastError: () => number
  getNumResults: () => number
  getResultFullPathName: (index: number, output: [string], outputLength: number) => number
  isFolderResult: (index: number) => boolean
}

interface Everything2Module {
  bindings: Everything2Bindings
  library: ReturnType<typeof koffi.load>
}

const sdk2BindingsCache = new Map<string, Everything2Module>()

function getBindings(dllPath: string): Everything2Bindings {
  const cachedModule = sdk2BindingsCache.get(dllPath)
  if (cachedModule) {
    return cachedModule.bindings
  }

  try {
    const library = koffi.load(dllPath)
    const bindings: Everything2Bindings = {
      setSearch: library.func("int __stdcall Everything_SetSearchW(const char16_t *search)"),
      setMatchPath: library.func("void __stdcall Everything_SetMatchPath(bool enabled)"),
      setMatchCase: library.func("void __stdcall Everything_SetMatchCase(bool enabled)"),
      setMatchWholeWord: library.func("void __stdcall Everything_SetMatchWholeWord(bool enabled)"),
      setRegex: library.func("void __stdcall Everything_SetRegex(bool enabled)"),
      setMax: library.func("void __stdcall Everything_SetMax(uint32_t max)"),
      setSort: library.func("void __stdcall Everything_SetSort(uint32_t sortType)"),
      setRequestFlags: library.func("void __stdcall Everything_SetRequestFlags(uint32_t flags)"),
      query: library.func("bool __stdcall Everything_QueryW(bool waitForResults)"),
      getLastError: library.func("uint32_t __stdcall Everything_GetLastError(void)"),
      getNumResults: library.func("uint32_t __stdcall Everything_GetNumResults(void)"),
      getResultFullPathName: library.func("uint32_t __stdcall Everything_GetResultFullPathNameW(uint32_t index, _Out_ char16_t *output, uint32_t outputLength)"),
      isFolderResult: library.func("bool __stdcall Everything_IsFolderResult(uint32_t index)")
    }
    sdk2BindingsCache.set(dllPath, { bindings, library })
    return bindings
  } catch (error) {
    throw new EverythingUnavailableError(`Everything 1.4 SDK is unavailable at ${dllPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function disposeSdk2(): void {
  for (const [dllPath, module] of Array.from(sdk2BindingsCache.entries())) {
    sdk2BindingsCache.delete(dllPath)
    module.library.unload()
  }
}

function createEverything2QueryError(lastError: number): Error {
  if (lastError === EVERYTHING2_ERROR_IPC) {
    return new EverythingUnavailableError("Everything 1.4 IPC is unavailable")
  }
  return new Error(`Everything 1.4 query failed (last_error=${lastError})`)
}

function configureEverything2Query(bindings: Everything2Bindings, search: string, limit: number, requestFlags: number): void {
  bindings.setMatchPath(false)
  bindings.setMatchCase(false)
  bindings.setMatchWholeWord(false)
  bindings.setRegex(false)
  bindings.setSearch(search)
  bindings.setMax(limit > 0 ? limit : EVERYTHING2_MAX_ALL)
  bindings.setSort(EVERYTHING2_SORT_NAME_ASCENDING)
  bindings.setRequestFlags(requestFlags)
}

export async function probeSdk2(nativeDirectory: string): Promise<boolean> {
  const dllPath = path.join(nativeDirectory, "Everything64.dll")

  try {
    const bindings = getBindings(dllPath)
    configureEverything2Query(bindings, "", 1, EVERYTHING2_REQUEST_FILE_NAME | EVERYTHING2_REQUEST_PATH)

    const ok = bindings.query(true)
    if (!ok) {
      const error = createEverything2QueryError(bindings.getLastError())
      if (error instanceof EverythingUnavailableError) {
        return false
      }
      throw error
    }

    return true
  } catch (error) {
    if (error instanceof EverythingUnavailableError) {
      return false
    }
    throw error
  }
}

export async function searchWithSdk2(nativeDirectory: string, search: string, limit: number): Promise<EverythingSearchResult[]> {
  const dllPath = path.join(nativeDirectory, "Everything64.dll")
  const bindings = getBindings(dllPath)

  configureEverything2Query(bindings, search, limit, EVERYTHING2_REQUEST_FILE_NAME | EVERYTHING2_REQUEST_PATH)

  const ok = bindings.query(true)
  if (!ok) {
    throw createEverything2QueryError(bindings.getLastError())
  }

  const results: EverythingSearchResult[] = []
  const count = bindings.getNumResults()
  const resultCount = limit > 0 ? Math.min(count, limit) : count

  for (let index = 0; index < resultCount; index += 1) {
    const output: [string] = ["\0".repeat(MAX_PATH_CHARS)]
    bindings.getResultFullPathName(index, output, MAX_PATH_CHARS)
    const filePath = output[0].replace(/\0+$/, "")
    if (!filePath) {
      continue
    }

    results.push({
      path: filePath,
      isDirectory: bindings.isFolderResult(index)
    })
  }

  return results
}
