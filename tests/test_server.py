"""
SmartBank server tests  (python -m unittest tests/test_server.py  ya  python tests/test_server.py)

Server ko ek temporary folder ke database ke saath chalate hain,
taaki asli data/smartbank.db ko kuch na ho.
"""
import json
import os
import re
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))

import server  # noqa: E402


class ServerTest(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="smartbank_test_")
        server.DATA_DIR = cls.tmp
        server.SmartBankHandler.databases = {
            name: server.Database(name, fname) for name, fname in server.DB_FILES.items()
        }
        cls.httpd, cls.port = server.make_server(18765)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:%d" % cls.port

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        for db in server.SmartBankHandler.databases.values():
            db.conn.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    # ---- helpers ------------------------------------------------------------
    def get(self, path, raw=False):
        with urllib.request.urlopen(self.base + path) as r:
            body = r.read()
            return (r, body) if raw else json.loads(body)

    def post(self, path, data, db="main"):
        req = urllib.request.Request(self.base + path, data=json.dumps(data).encode(),
                                     headers={"Content-Type": "application/json", "X-SB-DB": db})
        try:
            with urllib.request.urlopen(req) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            return json.loads(e.read())

    def db(self, body, db="main"):
        return self.post("/api/db", body, db)

    def setUp(self):
        self.db({"op": "drop"})
        self.db({"op": "drop"}, db="test")

    # ---- tests ----------------------------------------------------------------
    def test_health_reports_sqlite_and_schema_version(self):
        h = self.get("/api/health")
        self.assertTrue(h["ok"])
        self.assertEqual(h["driver"], "sqlite")
        with open(os.path.join(server.ROOT, "js", "schema.js"), encoding="utf-8") as f:
            version = int(re.search(r'"version":\s*(\d+)', f.read()).group(1))
        self.assertEqual(h["schema"], version)

    def test_insert_select_roundtrip(self):
        r = self.db({"op": "insert", "table": "users",
                     "row": {"name": "Test User", "email": "t@x.in", "password": "abc", "role": "customer"}})
        self.assertTrue(r["ok"])
        self.assertEqual(r["row"]["id"], 1)
        rows = self.db({"op": "select", "table": "users"})["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Test User")
        self.assertEqual(rows[0]["password"], "abc")

    def test_bool_json_and_extra_keys_survive(self):
        acc = self.db({"op": "insert", "table": "accounts",
                       "row": {"accNo": "SB1", "userId": 1, "type": "Savings", "balance": 100,
                               "features": ["cashback", "overdraft"], "somethingNew": {"x": 1}}})["row"]
        self.assertEqual(acc["features"], ["cashback", "overdraft"])
        self.assertEqual(acc["somethingNew"], {"x": 1})
        self.assertEqual(acc["balance"], 100)

        n = self.db({"op": "insert", "table": "notifications",
                     "row": {"userId": 1, "channel": "SMS", "read": False}})["row"]
        self.assertIs(n["read"], False)
        n2 = self.db({"op": "update", "table": "notifications", "id": n["id"], "changes": {"read": True}})["row"]
        self.assertIs(n2["read"], True)

    def test_update_merges_extra_and_missing_id_returns_none(self):
        row = self.db({"op": "insert", "table": "accounts",
                       "row": {"accNo": "SB2", "userId": 1, "type": "Current", "balance": 5, "a": 1}})["row"]
        upd = self.db({"op": "update", "table": "accounts", "id": row["id"],
                       "changes": {"balance": 99.5, "b": 2}})["row"]
        self.assertEqual(upd["balance"], 99.5)
        self.assertEqual((upd["a"], upd["b"]), (1, 2))
        self.assertIsNone(self.db({"op": "update", "table": "accounts", "id": 999, "changes": {"balance": 1}})["row"])

    def test_truncate_restarts_ids(self):
        for i in range(3):
            self.db({"op": "insert", "table": "access_log", "row": {"operation": "X", "allowed": True}})
        self.db({"op": "truncate", "table": "access_log"})
        self.assertEqual(self.db({"op": "select", "table": "access_log"})["rows"], [])
        again = self.db({"op": "insert", "table": "access_log", "row": {"operation": "Y", "allowed": False}})
        self.assertEqual(again["row"]["id"], 1)

    def test_delete_only_given_ids(self):
        for uid in (1, 1, 2):
            self.db({"op": "insert", "table": "notifications", "row": {"userId": uid, "channel": "SMS"}})
        mine = [r["id"] for r in self.db({"op": "select", "table": "notifications"})["rows"] if r["userId"] == 1]
        res = self.db({"op": "delete", "table": "notifications", "ids": mine})
        self.assertEqual(res["deleted"], 2)
        left = self.db({"op": "select", "table": "notifications"})["rows"]
        self.assertEqual([r["userId"] for r in left], [2])

    def test_unknown_table_and_injection_rejected(self):
        bad = self.db({"op": "select", "table": "users; DROP TABLE users"})
        self.assertFalse(bad["ok"])
        self.assertTrue(self.db({"op": "select", "table": "users"})["ok"])

    def test_sql_console_is_read_only(self):
        self.db({"op": "insert", "table": "users", "row": {"name": "A", "email": "a@x.in", "password": "p"}})
        ok = self.post("/api/sql", {"sql": "SELECT full_name, email FROM users"})
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["columns"], ["full_name", "email"])
        self.assertEqual(ok["rows"], [["A", "a@x.in"]])

        for sql in ("DELETE FROM users",
                    "SELECT 1; DELETE FROM users",
                    "WITH x AS (SELECT 1) DELETE FROM users",
                    "DROP TABLE users",
                    "UPDATE users SET full_name = 'hacked'"):
            res = self.post("/api/sql", {"sql": sql})
            self.assertFalse(res["ok"], sql)

        rows = self.db({"op": "select", "table": "users"})["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "A")

    def test_sql_log_shows_real_insert_statement(self):
        self.db({"op": "insert", "table": "transactions",
                 "row": {"txnId": "TXN9", "accNo": "SB1", "type": "Deposit", "direction": "credit",
                         "amount": 500, "status": "APPROVED"}})
        log = self.get("/api/sql-log")["entries"]
        inserts = [e["sql"] for e in log if e["sql"].startswith("INSERT INTO transactions")]
        self.assertTrue(inserts)
        self.assertIn("'TXN9'", inserts[-1])
        self.assertIn("500.0", inserts[-1])

    def test_test_database_is_isolated(self):
        self.db({"op": "insert", "table": "users", "row": {"name": "Main", "email": "m@x.in", "password": "p"}})
        self.assertEqual(len(self.db({"op": "select", "table": "users"}, db="test")["rows"]), 0)
        self.assertEqual(len(self.db({"op": "select", "table": "users"}, db="main")["rows"]), 1)

    def test_schema_endpoint_lists_all_tables(self):
        info = self.get("/api/schema")
        names = [t["name"] for t in info["tables"]]
        self.assertEqual(sorted(names), sorted(server.SCHEMA["tables"].keys()))
        users = next(t for t in info["tables"] if t["name"] == "users")
        cols = [c["name"] for c in users["columns"]]
        self.assertIn("password_hash", cols)
        self.assertIn("extra", cols)

    def test_static_files_served_without_cache_and_data_dir_blocked(self):
        resp, body = self.get("/index.html", raw=True)
        self.assertEqual(resp.status, 200)
        self.assertIn(b"SmartBank", body)
        self.assertEqual(resp.headers.get("Cache-Control"), "no-store")
        for path in ("/data/smartbank.db", "/.claude/launch.json", "/js/../data/smartbank.db"):
            with self.assertRaises(urllib.error.HTTPError) as ctx:
                urllib.request.urlopen(self.base + path)
            self.assertIn(ctx.exception.code, (403, 404))


if __name__ == "__main__":
    unittest.main(verbosity=2)
