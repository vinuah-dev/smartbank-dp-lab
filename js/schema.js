/* ==========================================================
   schema.js  -  SmartBank database schema (single source)

   Ye file do jagah use hoti hai:
     1. Browser me  -> ER diagram aur database page ke liye
     2. server.py   -> SQLite me CREATE TABLE banane ke liye
                       (Python isi file ko padhkar JSON nikalta hai)

   Har column: [js key, sql column, sql type, kind]
   kind = text | int | real | bool | json
   bool  -> SQLite me 0/1 ke roop me jaata hai
   json  -> array/object TEXT ke roop me jaata hai

   Dhyaan rahe: neeche wala object strict JSON me hi likhna hai
   (double quotes), warna Python use padh nahi paayega.
   ========================================================== */

const DB_SCHEMA = /* BEGIN SCHEMA */ {
  "version": 4,
  "tables": {
    "users": {
      "about": "Customers aur bank staff",
      "columns": [
        ["name",         "full_name",      "TEXT NOT NULL",          "text"],
        ["email",        "email",          "TEXT NOT NULL UNIQUE COLLATE NOCASE", "text"],
        ["mobile",       "mobile",         "TEXT",                   "text"],
        ["password",     "password_hash",  "TEXT NOT NULL",          "text"],
        ["salt",         "password_salt",  "TEXT",                   "text"],
        ["role",         "role",           "TEXT DEFAULT 'customer'","text"],
        ["designation",  "designation",    "TEXT",                   "text"],
        ["alertPrefs",   "alert_prefs",    "TEXT",                   "json"],
        ["failedLogins", "failed_logins",  "INTEGER DEFAULT 0",      "int"],
        ["lockedUntil",  "locked_until",   "INTEGER DEFAULT 0",      "int"],
        ["createdAt",    "created_at",     "TEXT",                   "text"]
      ],
      "foreign": []
    },
    "accounts": {
      "about": "Bank accounts (Factory Method se bante hain)",
      "columns": [
        ["accNo",        "acc_no",         "TEXT NOT NULL UNIQUE",   "text"],
        ["userId",       "user_id",        "INTEGER NOT NULL",       "int"],
        ["type",         "acc_type",       "TEXT NOT NULL",          "text"],
        ["balance",      "balance",        "REAL NOT NULL",          "real"],
        ["interest",     "interest_rate",  "REAL",                   "real"],
        ["minBalance",   "min_balance",    "REAL",                   "real"],
        ["dailyLimit",   "daily_limit",    "REAL",                   "real"],
        ["openedOn",     "opened_on",      "TEXT",                   "text"],
        ["status",       "status",         "TEXT DEFAULT 'Active'",  "text"],
        ["features",     "features",       "TEXT",                   "json"],
        ["rewardPoints", "reward_points",  "INTEGER DEFAULT 0",      "int"]
      ],
      "foreign": [["user_id", "users", "id"]]
    },
    "transactions": {
      "about": "Har transaction ka record (Database Logger observer likhta hai)",
      "columns": [
        ["txnId",        "txn_id",         "TEXT NOT NULL",          "text"],
        ["accNo",        "acc_no",         "TEXT NOT NULL",          "text"],
        ["userId",       "user_id",        "INTEGER",                "int"],
        ["type",         "txn_type",       "TEXT NOT NULL",          "text"],
        ["direction",    "direction",      "TEXT NOT NULL",          "text"],
        ["amount",       "amount",         "REAL NOT NULL",          "real"],
        ["fee",          "fee",            "REAL DEFAULT 0",         "real"],
        ["balance",      "balance_after",  "REAL",                   "real"],
        ["mode",         "mode",           "TEXT",                   "text"],
        ["status",       "status",         "TEXT NOT NULL",          "text"],
        ["approvedBy",   "approved_by",    "TEXT",                   "text"],
        ["remark",       "remark",         "TEXT",                   "text"],
        ["toAccount",    "to_account",     "TEXT",                   "text"],
        ["parentTxnId",  "parent_txn_id",  "TEXT",                   "text"],
        ["points",       "reward_points",  "INTEGER DEFAULT 0",      "int"],
        ["reversed",     "is_reversed",    "INTEGER DEFAULT 0",      "bool"],
        ["time",         "txn_time",       "TEXT",                   "text"],
        ["ts",           "txn_ts",         "TEXT",                   "text"]
      ],
      "foreign": [["acc_no", "accounts", "acc_no"], ["user_id", "users", "id"]]
    },
    "notifications": {
      "about": "SMS / Email / Push alerts (Observer pattern)",
      "columns": [
        ["userId",       "user_id",        "INTEGER NOT NULL",       "int"],
        ["channel",      "channel",        "TEXT NOT NULL",          "text"],
        ["target",       "target",         "TEXT",                   "text"],
        ["title",        "title",          "TEXT",                   "text"],
        ["message",      "message",        "TEXT",                   "text"],
        ["read",         "is_read",        "INTEGER DEFAULT 0",      "bool"],
        ["time",         "created_at",     "TEXT",                   "text"]
      ],
      "foreign": [["user_id", "users", "id"]]
    },
    "access_log": {
      "about": "Account access ka record (Proxy pattern)",
      "columns": [
        ["accNo",        "acc_no",         "TEXT",                   "text"],
        ["userId",       "user_id",        "INTEGER",                "int"],
        ["operation",    "operation",      "TEXT NOT NULL",          "text"],
        ["allowed",      "is_allowed",     "INTEGER NOT NULL",       "bool"],
        ["reason",       "reason",         "TEXT",                   "text"],
        ["time",         "logged_at",      "TEXT",                   "text"]
      ],
      "foreign": [["acc_no", "accounts", "acc_no"], ["user_id", "users", "id"]]
    },
    "command_log": {
      "about": "Undo history (Command pattern)",
      "columns": [
        ["label",        "label",          "TEXT",                   "text"],
        ["accNo",        "acc_no",         "TEXT",                   "text"],
        ["userId",       "user_id",        "INTEGER",                "int"],
        ["txnRowId",     "txn_row_id",     "INTEGER",                "int"],
        ["undone",       "is_undone",      "INTEGER DEFAULT 0",      "bool"],
        ["time",         "created_at",     "TEXT",                   "text"]
      ],
      "foreign": [["txn_row_id", "transactions", "id"], ["user_id", "users", "id"]]
    }
  }
} /* END SCHEMA */;
