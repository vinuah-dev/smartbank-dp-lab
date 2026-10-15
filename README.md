# SmartBank — A Design Pattern Driven Multi-Channel Banking System

A working internet-banking website built for our Design Patterns lab. It is not a set of
pattern demos — it is one real application with customer banking and a bank staff console,
and **14 design patterns** are what actually make it run.

## How to run

Open `index.html` in any browser. No server, no install, no build step.

**Demo logins**

| Email | Password | What they have |
|---|---|---|
| ramesh@smartbank.in | 1234 | Savings (Cashback add-on) + Fixed Deposit |
| sneha@smartbank.in | 1234 | Current (Overdraft + Reward Points add-ons) |
| amit@smartbank.in | 1234 | Savings, no add-ons |
| manager@smartbank.in | **admin** | Bank staff — opens the Bank Console instead |

You can also open a brand new account from the "Open New Account" tab.

## Pages

| Page | What it does |
|---|---|
| `index.html` | Login / open a new account |
| `dashboard.html` | Balance, account rules, add-ons, chart, recent transactions |
| `accounts.html` | All your accounts, add-on services, interest calculator, open new account |
| `banking.html` | Deposit, withdraw, and **undo last transaction** |
| `transfer.html` | Send money to another SmartBank account |
| `payments.html` | Pay bills and recharge a mobile |
| `history.html` | Statement (+ CSV download), command history, proxy access log, DB status |
| `notifications.html` | SMS / Email / Push alerts inbox |
| `settings.html` | Turn alerts on/off, switch channel |
| `admin.html` | **Bank staff only** — all accounts, freeze/close, reverse any transaction, monthly fee run, bank-wide stats |
| `patterns.html` | Where each of the 14 patterns lives and how to see it working |

## The 14 patterns

### Lab experiments (7)

| # | Pattern | File | Used for |
|---|---|---|---|
| 1 | **Singleton** | `js/core.js` | `BankConfig`, `DatabaseConnection`, `SessionManager` (also `CommandInvoker`, `BankingFacade`) |
| 2 | **Chain of Responsibility** | `js/approval.js` | Account Status → Fraud Check → Clerk (10K) → Manager (1L) → Branch Head (10L) → Rejected |
| 3 | **Factory Method** | `js/accounts.js` | Savings / Current / Fixed Deposit accounts, each with its own rules |
| 4 | **Proxy** | `js/accounts.js` | Owner check, lazy loading of the real account, and access logging |
| 5 | **Abstract Factory** | `js/channels.js` | ATM / Mobile / Web skins — Theme + Layout + Wording as one family |
| 6 | **Bridge** | `js/payments.js` | Transfer / Bill / Recharge × UPI / Card / Net Banking / Wallet |
| 7 | **Observer** | `js/observer.js` | SMS, Email, App Push, Low Balance and Database Logger observers |

Experiment mapping:

- **Experiment 1** — Singleton + Chain of Responsibility → `js/core.js`, `js/approval.js`
- **Experiment 2** — Factory Method + Proxy → `js/accounts.js`
- **Experiment 3** — Abstract Factory + Bridge → `js/channels.js`, `js/payments.js`
- **Experiment 4** — Observer + Database → `js/observer.js`, `js/core.js`

### Extra patterns that make it a real system (7)

| # | Pattern | File | Used for |
|---|---|---|---|
| 8 | **State** | `js/state.js` | Account Active / Frozen / Closed — each state decides what is allowed |
| 9 | **Strategy** | `js/strategy.js` | Simple / Compound / No interest formulas |
| 10 | **Command** | `js/command.js` | Every transaction has `execute()` + `undo()`; staff can reverse any entry |
| 11 | **Decorator** | `js/decorator.js` | Cashback, Overdraft, Insurance, Reward Points wrapped onto an account |
| 12 | **Adapter** | `js/adapter.js` | Third-party "QuickPay" wallet (paise, different method names) made to fit our gateway interface |
| 13 | **Facade** | `js/facade.js` | `BankingFacade` — the single door every page talks to |
| 14 | **Builder** | `js/builder.js` | `TransactionBuilder` builds a transaction request step by step |

## The one function to show in viva

`executeTransaction()` in `js/app.js`. Every transaction on the site goes through it:

1. **Builder** — the page builds the request object
2. **Facade** — it goes to `BankingFacade.transact()`
3. **Command** — a `TransactionCommand` is created and run by the invoker
4. **Singleton** — config, database and session are fetched
5. **Proxy** — owner is verified and the access is logged
6. **Decorator** — the account's add-ons are read (overdraft limit)
7. **Bridge** (+ **Adapter** for the wallet) — the gateway fee is calculated
8. **State** — is the account Active?
9. **Chain of Responsibility** — the amount goes through the approval chain
10. **Bridge** — the gateway processes the payment
11. **Proxy** — the balance is updated
12. **Observer** — alerts go out and the row is written to the database
13. **Decorator** — cashback and reward points are applied

## Things to try during the demo

| Do this | You will see |
|---|---|
| Withdraw Rs. 8,000 / 30,000 / 3,00,000 | Clerk / Manager / Branch Head approves it — the trail is printed |
| Withdraw more than the daily limit | Fraud Check rejects it before anyone sees it |
| Pay a bill from Ramesh's Savings | 1% cashback comes back automatically (Decorator) |
| Transfer using **QuickPay Wallet** | The Adapter's rupee↔paise conversion steps are printed (Bridge + Adapter) |
| Log in as Sneha, withdraw more than her balance | Overdraft lets it through and the balance goes negative |
| Press **Undo Last Transaction** on the banking page | Balance is restored, the row is marked REVERSED, a reversal entry appears |
| Log in as **manager@smartbank.in / admin** | The Bank Console opens instead of the dashboard |
| Freeze an account from the Bank Console | That customer can still deposit but cannot withdraw (State) |
| Reverse any transaction from the Bank Console | Balance fixed on both sides, and the customer gets an alert |
| Run "Charge Monthly Fees" | Only accounts with paid add-ons are debited |
| Switch account in the header | Everything re-renders for the other account |
| Switch channel (Web / Mobile / ATM) | Colours, corners, font and button wording all change together |
| Open My Accounts → Interest Calculator | Savings shows simple interest, FD shows compound — different Strategy classes |
| Turn off SMS in Settings, then transact | That one alert stops, everything else still works |
| Download the CSV statement | Real file, opens in Excel |
| Refresh or close the browser | All data is still there |

## Note on the database

A browser cannot connect to MySQL or Oracle directly, so the browser's `localStorage` is
used as the database. `DatabaseConnection` in `js/core.js` wraps it in a SQL-style layer —
`connect()`, `insert()`, `select()`, `selectOne()`, `update()`, `truncate()` — over six
tables: `users`, `accounts`, `transactions`, `notifications`, `access_log`, `command_log`.
The data survives a refresh and a browser restart, which is visible on the History page.

Passwords are stored as plain text because this is a local college demo with fake data.
A real bank would hash them — do not reuse this part anywhere real.

## Folder structure

```
smartbank/
 |- index.html           login / register
 |- dashboard.html
 |- accounts.html
 |- banking.html
 |- transfer.html
 |- payments.html
 |- history.html
 |- notifications.html
 |- settings.html
 |- admin.html           bank staff console
 |- patterns.html
 |- css/
 |   |- style.css        all colours come from CSS variables that the
 |                       Abstract Factory swaps at runtime
 |- js/
     |- core.js          Singleton  : config, database, session
     |- accounts.js      Factory Method + Proxy
     |- state.js         State      : Active / Frozen / Closed
     |- strategy.js      Strategy   : interest formulas
     |- decorator.js     Decorator  : account add-ons
     |- approval.js      Chain of Responsibility
     |- payments.js      Bridge     : payment types x gateways
     |- adapter.js       Adapter    : third party QuickPay wallet
     |- channels.js      Abstract Factory : ATM / Mobile / Web skins
     |- observer.js      Observer   : alerts + database logging
     |- builder.js       Builder    : transaction requests
     |- command.js       Command    : undo / reversal
     |- facade.js        Facade     : BankingFacade, the single entry point
     |- app.js           glue code, executeTransaction()
```

## Team

| Roll No. | Name | Work Done |
|---|---|---|
| -- | Vineet Shah | Exp 1 — Singleton, Chain of Responsibility |
| -- | Member 2 | Exp 2 — Factory Method, Proxy |
| -- | Member 3 | Exp 3 — Abstract Factory, Bridge |
| -- | Member 4 | Exp 4 — Observer, Database |
