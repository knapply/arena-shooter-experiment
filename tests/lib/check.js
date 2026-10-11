/* tiny assertion recorder: tests keep running after a failure so one run shows everything.
   In GitHub Actions, failures are also emitted as annotations (readable through the checks API). */
const results = [];
const gh = !!process.env.GITHUB_ACTIONS;
const esc = s => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
function check(ok, name, detail) {
  results.push({ ok: !!ok, name, detail });
  const d = detail !== undefined ? (typeof detail === "string" ? detail : JSON.stringify(detail)) : "";
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${d ? "  (" + d + ")" : ""}`);
  if (!ok && gh) console.log(`::error title=${esc(name)}::${esc(d || "failed")}`);
  return !!ok;
}
function finish(label) {
  const bad = results.filter(r => !r.ok);
  console.log(`${label}: ${results.length - bad.length}/${results.length} passed`);
  if (bad.length) process.exitCode = 1;
}
module.exports = { check, finish };
