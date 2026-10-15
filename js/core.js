/* ==========================================================
   core.js  -  SmartBank core layer
   Patterns used here : SINGLETON  (Experiment 1)
   Classes : BankConfig, DatabaseConnection, SessionManager

   Database do tarah se chal sakta hai (storage driver):
     1. SQLite  -> jab site server.py se khulti hai (asli .db file)
     2. Browser -> jab index.html seedha double-click se khulta hai
   Baaki poori website ko farak nahi padta ki kaunsa chal raha hai,
   kyunki sab DatabaseConnection ke through hi baat karte hain.
   ========================================================== */


/* ----------------------------------------------------------
   Test mode me alag naam se data rakhte hain taaki tests
   chalane se asli demo data kharab na ho.
   ---------------------------------------------------------- */
const SB_TEST_MODE = (typeof window !== "undefined" && window.SB_TEST_MODE === true);
const SB_NS        = SB_TEST_MODE ? "sbtest_" : "sb_";


/* ----------------------------------------------------------
   Storage helper
   Normally browser ka localStorage use hota hai (data save
   rehta hai). Kuch jagah localStorage band hota hai, tab site
   crash na ho isliye memory wala backup rakha hai.
   ---------------------------------------------------------- */
const Store = (function () {
  try {
    localStorage.setItem("__sb_test", "1");
    localStorage.removeItem("__sb_test");
    return { persistent: true, api: localStorage };
  } catch (e) {
    const mem = {};
    return {
      persistent: false,
      api: {
        getItem:    function (k) { return (k in mem) ? mem[k] : null; },
        setItem:    function (k, v) { mem[k] = String(v); },
        removeItem: function (k) { delete mem[k]; }
      }
    };
  }
})();


/* ----------------------------------------------------------
   Password hashing (SHA-256 + salt)
   Password kabhi bhi seedha save nahi hota. Har user ka apna
   random salt hota hai, aur DB me sirf sha256(salt:password)
   jaata hai. Login par wahi hash dobara bana kar match karte hain.
   ---------------------------------------------------------- */
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function sha256(text) {
  const bytes  = new TextEncoder().encode(String(text));
  const bitLen = bytes.length * 8;
  const total  = Math.ceil((bytes.length + 9) / 64) * 64;

  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;

  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  view.setUint32(total - 4, bitLen >>> 0);

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
             0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0;  h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;  h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;  h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;  h[7] = (h[7] + hh) >>> 0;
  }

  return h.map(x => x.toString(16).padStart(8, "0")).join("");
}

function makeSalt() {
  let s = "";
  for (let i = 0; i < 16; i++) {
    s += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return s;
}

function hashPassword(password, salt) {
  return sha256(salt + ":" + password);
}


/* ----------------------------------------------------------
   SINGLETON #1 : BankConfig
   Bank ki settings poore application me ek hi honi chahiye.
   ---------------------------------------------------------- */
class BankConfig {

  constructor() {
    if (BankConfig.instance) {
      return BankConfig.instance;          // purana object hi wapas
    }

    this.bankName      = "SmartBank";
    this.branch        = "Mumbai Main Branch";
    this.ifsc          = "SMRT0001234";
    this.currency      = "INR";
    this.clerkLimit    = 10000;
    this.managerLimit  = 100000;
    this.headLimit     = 1000000;
    this.maxLoginTries = 3;               // itni galti ke baad lock
    this.lockSeconds   = 30;
    this.bootTime      = new Date().toLocaleTimeString();

    BankConfig.instance = this;
  }

  static getInstance() {
    if (!BankConfig.instance) {
      BankConfig.instance = new BankConfig();
    }
    return BankConfig.instance;
  }
}


/* ==========================================================
   STORAGE DRIVERS
   DatabaseConnection khud data save nahi karta - wo ek driver
   ko kaam deta hai. Driver badalne se poori website ka database
   badal jaata hai, baaki code ko chhuna nahi padta.
   ========================================================== */

class StorageDriver {
  getName()                      { return "Driver"; }
  getKind()                      { return "none"; }
  ensureSchema(version, tables)  {}
  selectAll(table)               { return []; }
  insert(table, row)             { return row; }
  update(table, id, changes)     { return null; }
  deleteRows(table, ids)         {}
  truncate(table)                {}
  drop(tables)                   {}
}


/* ---------- Driver 1 : browser ka localStorage ---------- */
class LocalStorageDriver extends StorageDriver {

  getName() { return "Browser Storage (localStorage)"; }
  getKind() { return "local"; }

  _key(table) { return SB_NS + table; }

  ensureSchema(version, tables) {
    // purane version ka data ho to saaf karke naya shuru karo
    if (Store.api.getItem(SB_NS + "schema") !== String(version)) {
      this.drop(tables);
      Store.api.setItem(SB_NS + "schema", String(version));
    }
    for (const t of tables) {
      if (Store.api.getItem(this._key(t)) === null) {
        Store.api.setItem(this._key(t), "[]");
      }
    }
  }

  selectAll(table) {
    const raw = Store.api.getItem(this._key(table));
    return raw === null ? [] : JSON.parse(raw);
  }

  _save(table, rows) {
    Store.api.setItem(this._key(table), JSON.stringify(rows));
  }

  insert(table, row) {
    const rows = this.selectAll(table);
    let maxId = 0;
    for (const r of rows) if (r.id > maxId) maxId = r.id;
    row.id = maxId + 1;
    rows.push(row);
    this._save(table, rows);
    return row;
  }

  update(table, id, changes) {
    const rows = this.selectAll(table);
    for (const r of rows) {
      if (r.id === id) {
        Object.assign(r, changes);
        this._save(table, rows);
        return r;
      }
    }
    return null;
  }

  deleteRows(table, ids) {
    this._save(table, this.selectAll(table).filter(r => ids.indexOf(r.id) === -1));
  }

  truncate(table) {
    this._save(table, []);
  }

  drop(tables) {
    for (const t of tables) Store.api.removeItem(this._key(t));
    Store.api.removeItem(SB_NS + "session");
    Store.api.removeItem(SB_NS + "schema");
  }
}


/* ---------- Driver 2 : asli SQLite database (server.py) ---------- */
class SQLiteServerDriver extends StorageDriver {

  constructor(info) {
    super();
    this.info = info;                     // server ka /api/health jawab
  }

  getName() { return "SQLite (" + this.info.file + ")"; }
  getKind() { return "sqlite"; }

  // Synchronous request rakha hai taaki baaki poora code
  // pehle jaisa seedha (await ke bina) chal sake.
  call(body) {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "api/db", false);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("X-SB-DB", SB_TEST_MODE ? "test" : "main");
    xhr.send(JSON.stringify(body));

    let data = null;
    try { data = JSON.parse(xhr.responseText); } catch (e) { /* neeche handle */ }

    if (xhr.status !== 200 || data === null || data.ok !== true) {
      throw new Error("Database error: " + (data && data.error ? data.error : "server se jawab nahi aaya"));
    }
    return data;
  }

  ensureSchema() { /* tables server.py khud banata hai */ }

  selectAll(table)           { return this.call({ op: "select",   table: table }).rows; }
  insert(table, row)         { return this.call({ op: "insert",   table: table, row: row }).row; }
  update(table, id, changes) { return this.call({ op: "update",   table: table, id: id, changes: changes }).row; }
  deleteRows(table, ids)     { this.call({ op: "delete",   table: table, ids: ids }); }
  truncate(table)            { this.call({ op: "truncate", table: table }); }

  drop() {
    this.call({ op: "drop" });
    Store.api.removeItem(SB_NS + "session");
  }
}


/* server.py chal raha hai to SQLite, warna browser storage */
function detectDatabaseServer() {
  if (typeof location === "undefined" || typeof XMLHttpRequest === "undefined") return null;
  if (location.protocol !== "http:" && location.protocol !== "https:") return null;

  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "api/health?db=" + (SB_TEST_MODE ? "test" : "main"), false);
    xhr.send(null);
    if (xhr.status === 200) {
      const info = JSON.parse(xhr.responseText);
      if (info.ok === true && info.driver === "sqlite") return info;
    }
  } catch (e) { /* server nahi hai - koi baat nahi */ }

  return null;
}


/* ----------------------------------------------------------
   SINGLETON #2 : DatabaseConnection

   Poori website isi ek object se database se baat karti hai -
   insert, select, update, truncate. Connection ek hi hona
   chahiye isliye Singleton banaya hai.
   ---------------------------------------------------------- */
class DatabaseConnection {

  constructor() {
    if (DatabaseConnection.instance) {
      return DatabaseConnection.instance;
    }

    this.dbName     = "smartbank_db";
    this.connected  = false;
    this.queryCount = 0;
    this.tables     = Object.keys(DB_SCHEMA.tables);
    this.driver     = null;
    this.serverInfo = null;
    this._cache     = {};
    this._flushSet  = false;

    DatabaseConnection.instance = this;
  }

  static getInstance() {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection();
    }
    return DatabaseConnection.instance;
  }

  // CONNECT + CREATE TABLE IF NOT EXISTS
  connect() {
    if (this.connected) return true;

    this.serverInfo = detectDatabaseServer();
    this.driver = this.serverInfo
      ? new SQLiteServerDriver(this.serverInfo)
      : new LocalStorageDriver();

    this.driver.ensureSchema(DB_SCHEMA.version, this.tables);
    this.connected = true;
    return true;
  }

  getDriverName() { this.connect(); return this.driver.getName(); }
  getDriverKind() { this.connect(); return this.driver.getKind(); }
  isSQLite()      { return this.getDriverKind() === "sqlite"; }

  _check(table) {
    if (this.tables.indexOf(table) === -1) {
      throw new Error("Table '" + table + "' database me nahi hai");
    }
  }

  /* Ek hi user action me ek table baar baar padhna pade to
     server ko baar baar request na jaaye - chhota sa cache.
     Koi bhi write hote hi us table ka cache hat jaata hai. */
  _read(table) {
    this.connect();
    this._check(table);

    if (!this._cache[table]) {
      this._cache[table] = this.driver.selectAll(table);
      if (!this._flushSet && typeof setTimeout === "function") {
        this._flushSet = true;
        setTimeout(() => { this._cache = {}; this._flushSet = false; }, 0);
      }
    }
    return JSON.parse(JSON.stringify(this._cache[table]));
  }

  _changed(table) {
    delete this._cache[table];
    this.queryCount++;
  }

  // INSERT INTO <table> VALUES (...)
  insert(table, row) {
    this.connect();
    this._check(table);
    const saved = this.driver.insert(table, row);
    row.id = saved.id;
    this._changed(table);
    return saved;
  }

  // SELECT * FROM <table>
  selectAll(table) {
    this.queryCount++;
    return this._read(table);
  }

  // SELECT * FROM <table> WHERE ...
  select(table, condition) {
    this.queryCount++;
    return this._read(table).filter(condition);
  }

  // SELECT * FROM <table> WHERE ... LIMIT 1
  selectOne(table, condition) {
    this.queryCount++;
    const found = this._read(table).filter(condition);
    return found.length > 0 ? found[0] : null;
  }

  // UPDATE <table> SET ... WHERE id = ?
  update(table, id, changes) {
    this.connect();
    this._check(table);
    const row = this.driver.update(table, id, changes);
    this._changed(table);
    return row;
  }

  // DELETE FROM <table> WHERE id IN (...)
  deleteRows(table, ids) {
    this.connect();
    this._check(table);
    if (ids.length > 0) this.driver.deleteRows(table, ids);
    this._changed(table);
    return ids.length;
  }

  // DELETE FROM <table>
  truncate(table) {
    this.connect();
    this._check(table);
    this.driver.truncate(table);
    this._changed(table);
  }

  // sab kuch mita do (demo reset ke liye)
  dropDatabase() {
    this.connect();
    this.driver.drop(this.tables);
    this._cache = {};
    this.queryCount = 0;
    this.driver.ensureSchema(DB_SCHEMA.version, this.tables);
  }

  count(table) {
    return this._read(table).length;
  }
}


/* ----------------------------------------------------------
   SINGLETON #3 : SessionManager
   Kaun login hai ye poore site me ek hi jagah se pata chalta hai.
   Session browser me hi rehta hai (har browser ka apna login).
   ---------------------------------------------------------- */
class SessionManager {

  constructor() {
    if (SessionManager.instance) {
      return SessionManager.instance;
    }
    this.db  = DatabaseConnection.getInstance();
    this.key = SB_NS + "session";
    SessionManager.instance = this;
  }

  static getInstance() {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  login(userId, accNo) {
    const old = this.get();
    const session = {
      userId:    userId,
      accNo:     accNo,
      channel:   old ? old.channel : "web",
      loginTime: new Date().toLocaleString()
    };
    Store.api.setItem(this.key, JSON.stringify(session));
    return session;
  }

  // sirf active account badalna (login time wahi rehta hai)
  switchAccount(accNo) {
    const s = this.get();
    if (s === null) return;
    s.accNo = accNo;
    Store.api.setItem(this.key, JSON.stringify(s));
  }

  logout() {
    Store.api.removeItem(this.key);
  }

  get() {
    const raw = Store.api.getItem(this.key);
    return raw === null ? null : JSON.parse(raw);
  }

  // seed ya admin kaam ke liye session ko save/restore karna
  snapshot()         { return Store.api.getItem(this.key); }
  restore(raw) {
    if (raw === null) Store.api.removeItem(this.key);
    else Store.api.setItem(this.key, raw);
  }

  isLoggedIn() {
    return this.get() !== null;
  }

  getUser() {
    const s = this.get();
    if (s === null) return null;
    return this.db.selectOne("users", u => u.id === s.userId);
  }

  getAccount() {
    const s = this.get();
    if (s === null || !s.accNo) return null;
    return this.db.selectOne("accounts", a => a.accNo === s.accNo);
  }

  setChannel(channel) {
    const s = this.get();
    if (s === null) return;
    s.channel = channel;
    Store.api.setItem(this.key, JSON.stringify(s));
  }

  getChannel() {
    const s = this.get();
    return s === null ? "web" : (s.channel || "web");
  }
}
