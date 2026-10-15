/* ==========================================================
   tests/run-node.js  -  terminal me poora test suite chalao

       node tests/run-node.js

   Browser jaisa chhota sa mahaul (localStorage, document) bana
   kar saari js files usi order me load hoti hain jaise HTML
   pages me, phir tests/suite.js chalta hai.
   ========================================================== */

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT  = path.join(__dirname, "..");
const FILES = ["schema.js", "core.js", "accounts.js", "state.js", "strategy.js", "decorator.js",
               "approval.js", "payments.js", "adapter.js", "channels.js", "observer.js",
               "builder.js", "command.js", "facade.js", "app.js"];

const store = {};
const cssVars = {};
const context = {
  console, TextEncoder,
  window: { SB_TEST_MODE: true },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  },
  document: { documentElement: { style: { setProperty: (k, v) => { cssVars[k] = v; } } } }
};
vm.createContext(context);

for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", f), "utf8"), context, { filename: "js/" + f });
}
vm.runInContext(fs.readFileSync(path.join(__dirname, "suite.js"), "utf8"), context, { filename: "tests/suite.js" });

let pass = 0, fail = 0;
const failures = [];
const T = {
  section: name => console.log("\n== " + name + " =="),
  log: msg => console.log("   " + msg),
  check: (label, ok, detail) => {
    if (ok) { pass++; console.log("  PASS  " + label); }
    else {
      fail++;
      failures.push(label + (detail ? "  ->  " + detail : ""));
      console.log("  FAIL  " + label + (detail ? "\n        " + detail : ""));
    }
  }
};

const started = Date.now();
try {
  context.runSmartBankSuite(T);
} catch (e) {
  fail++;
  failures.push("CRASH: " + e.stack);
  console.log("\n!! CRASH: " + e.stack);
}

console.log("\n" + "=".repeat(60));
console.log(pass + " passed, " + fail + " failed  (" + (Date.now() - started) + " ms)");
if (failures.length) console.log("\nFailures:\n - " + failures.join("\n - "));
process.exitCode = fail === 0 ? 0 : 1;
