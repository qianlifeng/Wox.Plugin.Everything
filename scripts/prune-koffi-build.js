#!/usr/bin/env node

const fs = require("fs")
const path = require("path")

const buildRoot = process.argv[2]
const keepTriplet = process.argv[3]

if (!buildRoot || !keepTriplet) {
  console.error("Usage: prune-koffi-build.js <build-root> <keep-triplet>")
  process.exit(1)
}

if (!fs.existsSync(buildRoot)) {
  process.exit(0)
}

for (const entry of fs.readdirSync(buildRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue
  }
  if (entry.name === keepTriplet) {
    continue
  }

  fs.rmSync(path.join(buildRoot, entry.name), {
    recursive: true,
    force: true
  })
}
