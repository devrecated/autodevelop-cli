#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const path = require("path");

const vendor = path.join(__dirname, "..", "vendor", "autodevelop.exe");
const child = spawn(vendor, process.argv.slice(2), { stdio: "inherit", windowsHide: true });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code == null ? 1 : code);
});
