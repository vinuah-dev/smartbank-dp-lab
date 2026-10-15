# SmartBank — A Design Pattern Driven Banking System

A working internet-banking website built for our **Design Patterns lab**. It is one real
application — customer banking, a bank-staff console and a real SQLite database — and
**14 design patterns** are what make it run. The four lab experiments map to seven of them;
the other seven complete the system.

> Kal ke demo ka step-by-step script aur viva prep: **[SHOWCASE.md](SHOWCASE.md)**

## How to run

**Recommended — with the real SQLite database:** double-click **`start.bat`**
(or run `python server.py`). The browser opens at `http://127.0.0.1:8000/`.
Python 3 is the only requirement — the server uses the standard library only, nothing to install.

**Without Python:** double-click `index.html`. Everything works the same, but the data lives in
the browser's localStorage instead of SQLite (the header badge shows `DB: Browser`).

| Login | Password | What they have |
|---|---|---|
| ramesh@smartbank.in | 1234 | Savings (Cashback add-on) + Fixed Deposit |
| sneha@smartbank.in | 1234 | Current (Overdraft + Reward Points add-ons) |
| amit@smartbank.in | 1234 | Savings, no add-ons |
| manager@smartbank.in | admin | Bank staff — Bank Console and Database page |

The demo data includes a week of past transactions. To start fresh: staff → Bank Console →
*Reset Database*, or `python server.py --reset`.

## Pages

| Page | Who | What it does |
|---|---|---|
| `index.html` | everyone | Login (3 wrong tries = 30 s lock), open a new account |
| `patterns.html` | everyone | **DP Lab**: aim, UML diagram, live demo and real source code for all 14 patterns; printable lab record; viva Q&A |
| `dashboard.html` | customer | Balance, rules, add-ons, activity chart, recent transactions |
| `accounts.html` | customer | All accounts, add-on services, interest calculator, open another account |
| `banking.html` | customer | Deposit, withdraw, today's limit, **Undo last transaction** |
| `transfer.html` | customer | Send money (UPI / Card / Net Banking / QuickPay Wallet) |
| `payments.html` | customer | Bills and mobile recharge |
| `history.html` | customer | Statement + CSV download, undo history, proxy access log |
| `notifications.html` | customer | SMS / Email / Push / Low-balance alerts |
| `settings.html` | customer | Turn alerts on/off, switch channel skin, change password |
| `admin.html` | staff | Freeze / activate / close accounts, reverse any transaction, monthly fee run |
| `database.html` | staff | ER diagram, read-only SQL console, live SQL log, table browser |
| `tests.html` | everyone | Runs the automated test suite in the browser |

## The 14 patterns

### Lab experiments

| Exp | Pattern | File | Used for |
|---|---|---|---|
| 1 | **Singleton** | `js/core.js` | `BankConfig`, `DatabaseConnection`, `SessionManager` (also `CommandInvoker`, `BankingFacade`) |
| 1 | **Chain of Responsibility** | `js/approval.js` | Every debit: Account Status → Fraud Check → Clerk (10K) → Manager (1L) → Branch Head (10L) |
| 2 | **Factory Method** | `js/accounts.js` | Savings / Current / Fixed Deposit accounts, each with its own rules |
| 2 | **Proxy** | `js/accounts.js` | Owner check (protection), lazy real object (virtual), access log (logging) |
| 3 | **Abstract Factory** | `js/channels.js` | ATM / Mobile / Web skins — Theme + Layout + Wording as one family |
| 3 | **Bridge** | `js/payments.js` | 3 payment types × 4 gateways with 7 classes instead of 12 |
| 4 | **Observer + Database** | `js/observer.js`, `js/core.js`, `server.py` | SMS, Email, Push, Low Balance and Database Logger observers; SQLite storage |

### Extra

| Pattern | File | Used for |
|---|---|---|
| **State** | `js/state.js` | Active / Frozen / Closed accounts |
| **Strategy** | `js/strategy.js` | Simple, compound and no-interest formulas |
| **Command** | `js/command.js` | Undo and staff reversal (linked cashback / transfer-in entries reverse too) |
| **Decorator** | `js/decorator.js` | Cashback, Overdraft, Insurance, Reward Points add-ons |
| **Adapter** | `js/adapter.js` | Third-party QuickPay wallet (works in paise) fitted to our gateway interface |
| **Facade** | `js/facade.js` | `BankingFacade` — every page talks only to it |
| **Builder** | `js/builder.js` | `TransactionBuilder` builds and validates a transaction request |

The function to show in a viva is `executeTransaction()` in `js/app.js` — every transaction
runs through it, and the result screen lists which patterns ran.

## Database

`server.py` serves the site and runs a real **SQLite** database at `data/smartbank.db`
(6 tables with foreign keys and indexes). The table structure comes from **`js/schema.js`**,
which the browser also uses, so there is one schema for both. Values always go through `?`
parameters; table and column names only come from the schema; the SQL console runs on a
read-only connection. Every INSERT / UPDATE / DELETE is printed in the server window and on
the Database page.

When the site is opened without the server, `DatabaseConnection` switches to a
localStorage driver with the same interface — the rest of the code does not change.

## Security

- Passwords: per-user random salt + SHA-256; 3 wrong passwords lock the login for 30 seconds.
- Staff pages refuse customers and customer pages refuse staff.
- The login lives in sessionStorage, so each browser tab has its own login (customer in one tab, staff in another).
- All user-entered text is HTML-escaped before display; CSV export is formula-safe.
- The server listens on this computer only (`127.0.0.1` / `::1`).

This is a college project with demo data. SHA-256 is fine here; a real bank would use a slow
password hash (bcrypt / Argon2) on the server.

## Tests

```bash
node tests/run-node.js          # 144 checks: every pattern, every rule, ledger balance
python tests/test_server.py     # 12 checks: SQLite server, read-only console, isolation
```

The same `tests/suite.js` runs in the browser at `tests.html` — against a separate test
database, so demo data is never touched. In server mode `tests.html` also has a
**UI click-through test** (`tests/e2e-ui.js`, 51 checks) that fills the real forms and presses
the buttons on every page.

The suite's **ledger check** verifies, for every account, that the balance equals the sum of
all its approved entries.

## Folder structure

```
smartbank/
 |- start.bat            double-click to run (server + browser)
 |- server.py            Python stdlib server + SQLite
 |- index.html           login / register
 |- dashboard.html  accounts.html  banking.html  transfer.html  payments.html
 |- history.html  notifications.html  settings.html
 |- admin.html  database.html      staff pages
 |- patterns.html        DP Lab (lab record)
 |- tests.html           test runner
 |- css/style.css        colours are CSS variables that the Abstract Factory swaps
 |- js/
 |   |- schema.js        database schema (browser + server)
 |   |- core.js          Singleton: config, database + drivers, session; SHA-256
 |   |- accounts.js      Factory Method + Proxy
 |   |- state.js  strategy.js  decorator.js
 |   |- approval.js      Chain of Responsibility
 |   |- payments.js      Bridge          adapter.js   Adapter
 |   |- channels.js      Abstract Factory
 |   |- observer.js      Observer
 |   |- builder.js  command.js  facade.js
 |   |- app.js           executeTransaction(), header, seed data, shared UI
 |   |- uml.js  diagrams.js  lab.js     DP Lab page
 |- tests/
     |- suite.js  run-node.js  test_server.py  e2e-ui.js
```

## Team

| Roll No. | Name | Work Done |
|---|---|---|
| -- | Vineet Shah | Exp 1 — Singleton, Chain of Responsibility |
| -- | Member 2 | Exp 2 — Factory Method, Proxy |
| -- | Member 3 | Exp 3 — Abstract Factory, Bridge |
| -- | Member 4 | Exp 4 — Observer, Database |
