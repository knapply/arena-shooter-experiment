/* Check downloaded three.js files against the Subresource Integrity hashes the page uses
   (src/manifest.json threeIntegrity): node tools/check-three.js DIR. CI runs it after fetching
   three.module.min.js and three.core.min.js for the render tests, so a changed file fails the build
   instead of running. */
const fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");
const man = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "manifest.json"), "utf8"));
const dir = process.argv[2];
let bad = 0;
for (const f of ["three.module.min.js", "three.core.min.js"]) {
  const want = man.threeIntegrity["build/" + f];
  const got =
    "sha384-" +
    crypto
      .createHash("sha384")
      .update(fs.readFileSync(path.join(dir, f)))
      .digest("base64");
  if (got !== want) {
    console.error(`${f}: ${got} is not the pinned ${want}`);
    bad++;
  } else console.log(`${f}: ok`);
}
process.exit(bad ? 1 : 0);
