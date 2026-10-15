# SmartBank — Showcase Guide (kal ke demo ke liye)

Ye file sirf tumhare liye hai: demo se pehle kya karna hai, ma'am ke saamne kis order me kya
dikhana hai, aur kya poocha ja sakta hai.

---

## 1. Demo se 10 minute pehle

1. `dp lab` folder me **`start.bat`** double-click karo.
   - Ek black window khulegi ("SmartBank server chal raha hai") — **isse band mat karna**.
   - Browser apne aap `http://127.0.0.1:8000/` par khulega.
2. Login page par **`DB: SQLite`** ka hara badge dikhna chahiye. (Peela `DB: Browser` dikhe to
   server nahi chal raha — neeche *Problem aaye to* dekho.)
3. Fresh data chahiye to: `manager@smartbank.in / admin` se login → **Bank Console** →
   *Reset Database*. (Ya black window band karke `python server.py --reset` chalao.)
4. Browser me 3 tabs khol ke rakho:
   - Tab 1: login page (customer demo)
   - Tab 2: `http://127.0.0.1:8000/patterns.html` (DP Lab — bina login khulta hai)
   - Tab 3: `http://127.0.0.1:8000/tests.html`
5. Black server window ko screen ke kone me rakho — har transaction par usme asli
   `INSERT INTO ...` SQL line aati hai. Ma'am ko ye dikhana impressive lagta hai.

---

## 2. Demo script (~12 minute)

### Shuruaat (1 min)
> "Ma'am, humne 4 alag programs ki jagah ek poora banking system banaya hai — SmartBank. Isme
> lab ke chaaro experiments ke 7 patterns asli kaam kar rahe hain, aur system ko complete karne
> ke liye 7 aur patterns lagaye hain. Database asli SQLite hai."

DP Lab tab dikhao → upar ki table (Experiment → patterns → files).

### Experiment 1 — Singleton + Chain of Responsibility (2 min)
1. Customer tab: `ramesh@smartbank.in / 1234` login (demo box me email par click karo, apne aap bhar jaata hai).
2. **Deposit / Withdraw** → **Rs. 8,000** withdraw → result me *Approval chain*: Account Status → Fraud Check → **Clerk** approved.
3. Phir **Rs. 30,000** withdraw → Clerk "upar bheja" → **Manager** approved.
4. Phir **Rs. 20,000** → **Fraud Check reject**: "daily limit Rs. 50,000 me se aaj Rs. 38,000 use ho chuka hai".
   > "Daily limit poore din ki hai, ek transaction ki nahi — Fraud Check aaj ka total dekhta hai."
5. DP Lab → Exp 1 → Singleton ka **Run live demo**: `a === b → true`, `new BankConfig()` par bhi same object.
6. **View code** dabake `BankConfig` ka constructor dikhao (`if (BankConfig.instance) return ...`).

### Experiment 2 — Factory Method + Proxy (2 min)
1. **My Accounts** → *Open a New Account* → type badlo → rules box badalta hai (min balance, interest, FD me withdrawal "Nahi").
   Current Rs. 5,000 se kholne ki koshish → reject (min Rs. 10,000). Rs. 15,000 → khul gaya.
2. DP Lab → Proxy **Run live demo**: Ramesh ko apna balance milta hai, Sneha ko "Access denied", aur
   `real object bana? false` → `true` (lazy loading).
3. **History** page → *Account Access Log* — har READ / DEBIT proxy ne likha hai.

### Experiment 3 — Abstract Factory + Bridge (2 min)
1. Header ka dropdown **Web Portal → Mobile App → ATM Machine** — poori website ka rang, corners,
   font aur button ka text ek saath badalta hai. (Wapas Web Portal kar dena.)
   > "Ek factory poori family deti hai — ATM ka theme kabhi Mobile ke button ke saath nahi lagega."
2. **Transfer** → beneficiary *Sneha* → gateway **QuickPay Wallet** → Rs. 2,000 → Send.
   Result me **"Patterns jo is transaction me chale"** — saare 11 chips jale hue. Ye screen sabse zaroori hai.
   - *Payment route (Bridge)*: Money Transfer + QuickPay Wallet
   - *Behind the scenes*: Adapter ne rupees ko paise me badla.
3. DP Lab → Bridge ki table (3 × 4 = 12 combinations, classes sirf 7).

### Experiment 4 — Observer + Database (3 min)
1. **Alerts** (header) → SMS, Email, Push messages jo abhi ke transactions se aaye.
2. **Settings** → SMS band karo → Save → *Observers That Will Run* me 4 bache.
   Deposit karo → Alerts me SMS nahi aaya, baaki aaye. (SMS wapas chalu kar dena.)
   > "Account ka code nahi badla — sirf observer detach hua. Ye loose coupling hai."
3. Logout → `manager@smartbank.in / admin` → **Database** page:
   - **ER diagram** (6 tables, foreign keys)
   - SQL console: *Balance per customer (JOIN)* sample dabao → asli SQL result
   - `DELETE FROM users` likh ke Run → "read-only" reject
   - **Live SQL Log** — customer tab me transaction karo, yahan turant INSERT dikhega
4. Black server window me bhi wahi SQL lines dikhao.

### Extra patterns (1-2 min, time ho to)
- **Bank Console** → Ramesh ka Savings **Freeze** (State) → customer tab me withdraw → "Account Status: frozen" reject, deposit chal jaata hai. Phir **Activate**.
- Bank Console → kisi Transfer par **Reverse** (Command) → dono accounts ka balance wapas, "2 entries ulti ki gayi".
- Customer → Deposit / Withdraw → **Undo Last Transaction**.
- My Accounts → add-ons (Decorator), Interest calculator (Strategy).

### Ant me (30 sec)
**tests.html** → *Run all tests* → **141 passed** (3 sec).
> "Har pattern aur har rule ka automated test hai, aur har account ka balance uski entries ke jod se match hota hai."

---

## 3. Viva me kya pooch sakte hain

DP Lab page ke neeche **Viva questions** section me 17 sawaal-jawab hain. Sabse zaroori:

| Sawaal | Chhota jawab |
|---|---|
| Factory Method vs Abstract Factory? | Factory Method = ek product, subclass decide karti hai. Abstract Factory = judi hui products ki poori family. |
| Proxy vs Decorator? | Proxy access control karta hai (same interface, client ko pata nahi). Decorator naya behaviour jodta hai, kai ek ke upar ek. |
| Bridge vs Adapter? | Bridge pehle se design karte hain (do hierarchies alag). Adapter baad me lagta hai jab bahar ki class match na kare. |
| Singleton ka nuksaan? | Global state, testing mushkil. Isliye tests alag database (test mode) par chalte hain. |
| Observer push ya pull? | Push — `update(event)` me poora event jaata hai. |
| Database kaise connect hai? | `server.py` (Python standard library) + SQLite. Browser `api/db` ko request bhejta hai, server `?` parameters wali SQL chalata hai. |
| SQL injection? | Table / column naam schema se aate hain, values `?` se. Console read-only connection par. |
| Password? | Random salt + SHA-256. 3 galat try → 30 sec lock. |
| Chain me koi handle na kare? | End par `passOn()` REJECTED kar deta hai (Rs. 25 lakh demo). |
| Undo kaise? | `TransactionCommand` + `CommandInvoker`; history `command_log` table me. Undo cashback / transfer-in bhi ulta karta hai. |

**Code dikhane ko kahe to:** `js/app.js` me `executeTransaction()` — ek hi function me saare patterns order se.
Ya DP Lab me us pattern ka **View code**.

---

## 4. Problem aaye to

| Problem | Kya karo |
|---|---|
| `start.bat` par "Python nahi mila" | Site browser mode me khul jaayegi — sab kaam karega, bas SQLite ki jagah browser storage. Database page ka SQL console nahi chalega. |
| Black window turant band ho gayi | `dp lab` folder me address bar me `cmd` likh ke Enter → `python server.py` chalao, error padh lo. |
| "Koi free port nahi mila" | Pehle wali black window band karo (ek hi server chalna chahiye). |
| Badge `DB: Browser` dikh raha hai jabki server chal raha hai | Address `http://127.0.0.1:8000/...` hona chahiye, `file:///...` nahi. |
| Kuch ajeeb data / balance | Staff → Bank Console → *Reset Database*. |
| Login lock ho gaya (3 galat password) | 30 second ruko. |
| Page purana dikh raha hai | `Ctrl + F5`. |

Server band karna ho to black window me **Ctrl + C**.

---

## 5. Team me kaun kya bolega (suggestion)

| Member | Part |
|---|---|
| Vineet | Intro + Exp 1 (Singleton, Chain) + full-flow transfer screen |
| Member 2 | Exp 2 (Factory Method, Proxy) |
| Member 3 | Exp 3 (Abstract Factory, Bridge, Adapter) |
| Member 4 | Exp 4 (Observer, Database page, SQL console) + tests |

All the best!
