import koffi from "koffi"
import path from "path"
import { EverythingUnavailableError } from "./search"
import { EverythingSearchResult } from "./types"

const EVERYTHING3_PROPERTY_ID_SIZE = 2
const EVERYTHING3_PROPERTY_ID_DATE_MODIFIED = 5
const EVERYTHING3_PROPERTY_ID_PATH_AND_NAME = 240
const MAX_PATH_CHARS = 32768

interface Everything3Bindings {
  connect: (instanceName: string | null) => unknown
  destroyClient: (client: unknown) => void
  createSearchState: () => unknown
  destroySearchState: (searchState: unknown) => void
  setSearchMatchCase: (searchState: unknown, enabled: boolean) => void
  setSearchMatchWholeWords: (searchState: unknown, enabled: boolean) => void
  setSearchMatchPath: (searchState: unknown, enabled: boolean) => void
  setSearchRegex: (searchState: unknown, enabled: boolean) => void
  setSearchText: (searchState: unknown, text: string) => void
  setSearchViewportCount: (searchState: unknown, count: number) => void
  addSearchPropertyRequest: (searchState: unknown, propertyId: number) => void
  search: (client: unknown, searchState: unknown) => unknown
  destroyResultList: (resultList: unknown) => void
  getResultListViewportCount: (resultList: unknown) => number
  isFolderResult: (resultList: unknown, index: number) => boolean
  getResultFullPathName: (resultList: unknown, index: number, output: [string], outputLength: number) => number
}

interface Everything3Module {
  bindings: Everything3Bindings
  library: ReturnType<typeof koffi.load>
}

const sdk3BindingsCache = new Map<string, Everything3Module>()
const sdk3ClientCache = new Map<string, unknown>()

function isNullPointer(value: unknown): boolean {
  return value === null || value === undefined || value === 0
}

function connectSdk3Client(bindings: Everything3Bindings): unknown {
  return bindings.connect(null) || bindings.connect("1.5a")
}

function getCachedSdk3Client(dllPath: string, bindings: Everything3Bindings): unknown {
  const cachedClient = sdk3ClientCache.get(dllPath)
  if (!isNullPointer(cachedClient)) {
    return cachedClient
  }

  const client = connectSdk3Client(bindings)
  if (!isNullPointer(client)) {
    sdk3ClientCache.set(dllPath, client)
  }

  return client
}

function resetCachedSdk3Client(dllPath: string, bindings: Everything3Bindings): void {
  const cachedClient = sdk3ClientCache.get(dllPath)
  if (!isNullPointer(cachedClient)) {
    bindings.destroyClient(cachedClient)
  }
  sdk3ClientCache.delete(dllPath)
}

function getBindings(dllPath: string): Everything3Bindings {
  const cachedModule = sdk3BindingsCache.get(dllPath)
  if (cachedModule) {
    return cachedModule.bindings
  }

  try {
    const library = koffi.load(dllPath)
    const bindings: Everything3Bindings = {
      connect: library.func("void * __stdcall Everything3_ConnectW(const char16_t *instanceName)"),
      destroyClient: library.func("void __stdcall Everything3_DestroyClient(void *client)"),
      createSearchState: library.func("void * __stdcall Everything3_CreateSearchState(void)"),
      destroySearchState: library.func("void __stdcall Everything3_DestroySearchState(void *searchState)"),
      setSearchMatchCase: library.func("void __stdcall Everything3_SetSearchMatchCase(void *searchState, bool enabled)"),
      setSearchMatchWholeWords: library.func("void __stdcall Everything3_SetSearchMatchWholeWords(void *searchState, bool enabled)"),
      setSearchMatchPath: library.func("void __stdcall Everything3_SetSearchMatchPath(void *searchState, bool enabled)"),
      setSearchRegex: library.func("void __stdcall Everything3_SetSearchRegex(void *searchState, bool enabled)"),
      setSearchText: library.func("void __stdcall Everything3_SetSearchTextW(void *searchState, const char16_t *text)"),
      setSearchViewportCount: library.func("void __stdcall Everything3_SetSearchViewportCount(void *searchState, int count)"),
      addSearchPropertyRequest: library.func("void __stdcall Everything3_AddSearchPropertyRequest(void *searchState, int propertyId)"),
      search: library.func("void * __stdcall Everything3_Search(void *client, void *searchState)"),
      destroyResultList: library.func("void __stdcall Everything3_DestroyResultList(void *resultList)"),
      getResultListViewportCount: library.func("int __stdcall Everything3_GetResultListViewportCount(void *resultList)"),
      isFolderResult: library.func("bool __stdcall Everything3_IsFolderResult(void *resultList, int index)"),
      getResultFullPathName: library.func("int __stdcall Everything3_GetResultFullPathNameW(void *resultList, int index, _Out_ char16_t *output, int outputLength)")
    }
    sdk3BindingsCache.set(dllPath, { bindings, library })
    return bindings
  } catch (error) {
    throw new EverythingUnavailableError(`Everything 1.5 SDK is unavailable at ${dllPath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function disposeSdk3(): void {
  for (const [dllPath, module] of Array.from(sdk3BindingsCache.entries())) {
    resetCachedSdk3Client(dllPath, module.bindings)
    sdk3BindingsCache.delete(dllPath)
    module.library.unload()
  }
}

export async function probeSdk3(nativeDirectory: string): Promise<boolean> {
  const dllPath = path.join(nativeDirectory, "Everything3_x64.dll")

  try {
    const bindings = getBindings(dllPath)
    const client = getCachedSdk3Client(dllPath, bindings)
    return !isNullPointer(client)
  } catch (error) {
    if (error instanceof EverythingUnavailableError) {
      return false
    }
    throw error
  }
}

export async function searchWithSdk3(nativeDirectory: string, search: string, limit: number): Promise<EverythingSearchResult[]> {
  const dllPath = path.join(nativeDirectory, "Everything3_x64.dll")
  const bindings = getBindings(dllPath)

  let client = getCachedSdk3Client(dllPath, bindings)
  if (isNullPointer(client)) {
    throw new EverythingUnavailableError(`Everything 1.5 connection failed via ${dllPath}`)
  }

  const searchState = bindings.createSearchState()
  if (isNullPointer(searchState)) {
    resetCachedSdk3Client(dllPath, bindings)
    throw new EverythingUnavailableError(`Everything 1.5 search state creation failed via ${dllPath}`)
  }

  try {
    bindings.setSearchMatchCase(searchState, false)
    bindings.setSearchMatchWholeWords(searchState, false)
    bindings.setSearchMatchPath(searchState, false)
    bindings.setSearchRegex(searchState, false)
    bindings.setSearchText(searchState, search)
    if (limit > 0) {
      bindings.setSearchViewportCount(searchState, limit)
    }
    bindings.addSearchPropertyRequest(searchState, EVERYTHING3_PROPERTY_ID_PATH_AND_NAME)
    bindings.addSearchPropertyRequest(searchState, EVERYTHING3_PROPERTY_ID_SIZE)
    bindings.addSearchPropertyRequest(searchState, EVERYTHING3_PROPERTY_ID_DATE_MODIFIED)

    const resultList = bindings.search(client, searchState)
    let finalResultList = resultList
    if (isNullPointer(finalResultList)) {
      resetCachedSdk3Client(dllPath, bindings)
      client = getCachedSdk3Client(dllPath, bindings)
      if (isNullPointer(client)) {
        throw new EverythingUnavailableError(`Everything 1.5 reconnection failed via ${dllPath}`)
      }
      finalResultList = bindings.search(client, searchState)
    }
    if (isNullPointer(finalResultList)) {
      throw new EverythingUnavailableError(`Everything 1.5 search failed via ${dllPath}`)
    }

    try {
      const results: EverythingSearchResult[] = []
      const count = bindings.getResultListViewportCount(finalResultList)
      const resultCount = limit > 0 ? Math.min(count, limit) : count

      for (let index = 0; index < resultCount; index += 1) {
        const output: [string] = ["\0".repeat(MAX_PATH_CHARS)]
        bindings.getResultFullPathName(finalResultList, index, output, MAX_PATH_CHARS)
        const filePath = output[0].replace(/\0+$/, "")
        if (!filePath) {
          continue
        }

        results.push({
          path: filePath,
          isDirectory: bindings.isFolderResult(finalResultList, index)
        })
      }

      return results
    } finally {
      bindings.destroyResultList(finalResultList)
    }
  } finally {
    bindings.destroySearchState(searchState)
  }
}
