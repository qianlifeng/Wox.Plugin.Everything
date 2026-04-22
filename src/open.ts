import { spawn } from "child_process"

export function openPath(targetPath: string): Promise<void> {
  if (process.platform !== "win32") {
    return Promise.reject(new Error("Opening paths is only supported on Windows"))
  }

  return new Promise((resolve, reject) => {
    const command = `start "" "${targetPath.replace(/"/g, '""')}"`
    const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      detached: true,
      stdio: "ignore",
      windowsHide: true
    })

    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolve()
    })
  })
}
