import { spawn } from "child_process"
import { EventEmitter } from "events"
import fs from "fs/promises"
import { openContainingFolder, openPath } from "../open"

jest.mock("child_process", () => ({
  spawn: jest.fn()
}))
jest.mock("fs/promises", () => ({
  stat: jest.fn()
}))

const spawnMock = spawn as jest.MockedFunction<typeof spawn>
const statMock = fs.stat as jest.MockedFunction<typeof fs.stat>
const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true
  })
}

function createSpawnedProcess(): ReturnType<typeof spawn> & { unref: jest.Mock } {
  const child = new EventEmitter() as ReturnType<typeof spawn> & { unref: jest.Mock }
  child.unref = jest.fn()
  spawnMock.mockReturnValue(child)
  return child
}

describe("open helpers", () => {
  beforeEach(() => {
    spawnMock.mockReset()
    statMock.mockResolvedValue({} as Awaited<ReturnType<typeof fs.stat>>)
    setPlatform("win32")
  })

  afterAll(() => {
    setPlatform(originalPlatform)
  })

  test("opens a path through Windows shell association", async () => {
    const child = createSpawnedProcess()

    const opened = openPath("C:\\Docs\\file.txt")
    child.emit("spawn")
    await opened

    expect(spawnMock).toHaveBeenCalledWith("cmd.exe", ["/C", "start", '""', '"C:\\Docs\\file.txt"'], {
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true
    })
    expect(child.unref).toHaveBeenCalled()
  })

  test("opens the containing folder and selects the path", async () => {
    const child = createSpawnedProcess()

    const opened = openContainingFolder("C:\\Docs\\file.txt")
    await Promise.resolve()
    child.emit("spawn")
    await opened

    expect(statMock).toHaveBeenCalledWith("C:\\Docs\\file.txt")
    expect(spawnMock).toHaveBeenCalledWith("powershell.exe", ["-Command", 'Start-Process "explorer.exe" -ArgumentList "/select,C:\\Docs\\file.txt"'], {
      stdio: "ignore",
      windowsHide: true
    })
    expect(child.unref).toHaveBeenCalled()
  })
})
