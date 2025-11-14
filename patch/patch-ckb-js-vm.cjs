// scripts/patch-ckb-js-vm.cjs
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const src = path.join(root, "patch", "ckb-js-vm");
const dstDir = path.join(
  root,
  "node_modules",
  "ckb-testtool",
  "src",
  "unittest",
  "defaultScript"
);
const dst = path.join(dstDir, "ckb-js-vm");

if (!fs.existsSync(src)) {
  console.log("[patch-ckb-js-vm] skip: custom binary not found:", src);
  process.exit(0);
}
if (!fs.existsSync(dstDir)) {
  console.log("[patch-ckb-js-vm] skip: target dir not found:", dstDir);
  process.exit(0);
}

try {
  if (fs.existsSync(dst)) {
    fs.rmSync(dst);
  }
  fs.copyFileSync(src, dst);
  fs.chmodSync(dst, 0o755);
  console.log("[patch-ckb-js-vm] patched:", dst);
} catch (e) {
  console.warn("[patch-ckb-js-vm] failed:", e.message);
}
