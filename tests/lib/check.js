/* tiny assertion recorder: tests keep running after a failure so one run shows everything */
const results = [];
function check(ok, name, detail) {
  results.push({ ok: !!ok, name, detail });
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${name}${detail !== undefined ? "  (" + (typeof detail === "string" ? detail : JSON.stringify(detail)) + ")" : ""}`
  );
  return !!ok;
}
function finish(label) {
  const bad = results.filter(r => !r.ok);
  console.log(`${label}: ${results.length - bad.length}/${results.length} passed`);
  if (bad.length) process.exitCode = 1;
}
module.exports = { check, finish };
