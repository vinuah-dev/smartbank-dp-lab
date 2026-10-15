/* ==========================================================
   core.js  -  SmartBank core layer
   Patterns used here : SINGLETON  (Experiment 1)
   Classes : BankConfig, DatabaseConnection, SessionManager
   ========================================================== */


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


/* ----------------------------------------------------------
   SINGLETON #2 : DatabaseConnection

   Browser se MySQL direct connect nahi hota, isliye humne
   localStorage ko database ki tarah use kiya hai. Ye class
   uske upar ek SQL jaisa layer deti hai - insert, select,
   update, delete. Connection ek hi hona chahiye isliye
   Singleton banaya hai.
   ---------------------------------------------------------- */
class DatabaseConnection {

  constructor() {
    if (DatabaseConnection.instance) {
      return DatabaseConnection.instance;
    }

    this.dbName     = "smartbank_db";
    this.connected  = false;
    this.queryCount = 0;
    this.tables     = ["users", "accounts", "transactions",
                       "notifications", "access_log", "command_log"];

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

    for (const t of this.tables) {
      if (Store.api.getItem(this._key(t)) === null) {
        Store.api.setItem(this._key(t), JSON.stringify([]));
      }
    }
    this.connected = true;
    return true;
  }

  _key(table) {
    return "sb_" + table;
  }

  _read(table) {
    this.connect();
    const raw = Store.api.getItem(this._key(table));
    return raw === null ? [] : JSON.parse(raw);
  }

  _write(table, rows) {
    Store.api.setItem(this._key(table), JSON.stringify(rows));
  }

  // INSERT INTO <table> VALUES (...)
  insert(table, row) {
    const rows = this._read(table);
    let maxId = 0;
    for (const r of rows) {
      if (r.id > maxId) maxId = r.id;
    }
    row.id = maxId + 1;
    rows.push(row);
    this._write(table, rows);
    this.queryCount++;
    return row;
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
    const rows = this._read(table);
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].id === id) {
        Object.assign(rows[i], changes);
        this._write(table, rows);
        this.queryCount++;
        return rows[i];
      }
    }
    return null;
  }

  // DELETE FROM <table>
  truncate(table) {
    this._write(table, []);
    this.queryCount++;
  }

  // sab kuch mita do (demo reset ke liye)
  dropDatabase() {
    for (const t of this.tables) {
      Store.api.removeItem(this._key(t));
    }
    Store.api.removeItem("sb_session");
    this.connected = false;
    this.queryCount = 0;
  }

  count(table) {
    return this._read(table).length;
  }
}


/* ----------------------------------------------------------
   SINGLETON #3 : SessionManager
   Kaun login hai ye poore site me ek hi jagah se pata chalta hai.
   ---------------------------------------------------------- */
class SessionManager {

  constructor() {
    if (SessionManager.instance) {
      return SessionManager.instance;
    }
    this.db = DatabaseConnection.getInstance();
    SessionManager.instance = this;
  }

  static getInstance() {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  login(userId, accNo) {
    const session = {
      userId: userId,
      accNo: accNo,
      channel: "web",
      loginTime: new Date().toLocaleString()
    };
    Store.api.setItem("sb_session", JSON.stringify(session));
    return session;
  }

  logout() {
    Store.api.removeItem("sb_session");
  }

  get() {
    const raw = Store.api.getItem("sb_session");
    return raw === null ? null : JSON.parse(raw);
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
    if (s === null) return null;
    return this.db.selectOne("accounts", a => a.accNo === s.accNo);
  }

  setChannel(channel) {
    const s = this.get();
    if (s === null) return;
    s.channel = channel;
    Store.api.setItem("sb_session", JSON.stringify(s));
  }

  getChannel() {
    const s = this.get();
    return s === null ? "web" : s.channel;
  }
}
