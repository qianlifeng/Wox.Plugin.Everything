import { spawn } from "child_process"
import fs from "fs/promises"
import path from "path"

function quoteCmdArg(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value
  }
  return `"${value.replace(/"/g, '""')}"`
}

function runWindowsCommand(command: string, args: string[], options: { windowsVerbatimArguments?: boolean } = {}): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("Opening paths is only supported on Windows"))
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "ignore",
      windowsHide: true,
      ...options
    })

    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}

export function openPath(targetPath: string): Promise<void> {
  return runWindowsCommand("cmd.exe", ["/C", "start", '""', quoteCmdArg(targetPath)], {
    windowsVerbatimArguments: true
  })
}

export async function openContainingFolder(targetPath: string): Promise<void> {
  await fs.stat(targetPath)
  const absolutePath = path.win32.resolve(targetPath)
  return runWindowsCommand("powershell.exe", ["-Command", `Start-Process "explorer.exe" -ArgumentList "/select,${absolutePath}"`])
}
