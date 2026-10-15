#!/usr/bin/env python3
"""
SmartBank local server
======================
Sirf Python ki standard library use hoti hai - koi pip install nahi chahiye.

    python server.py                   # http://127.0.0.1:8000 browser me khul jaayega
    python server.py --port 9000       # doosra port
    python server.py --no-browser      # browser apne aap mat kholo
    python server.py --reset           # database mita ke naye sire se shuru

Ye kya karta hai:
  1. Website ki files serve karta hai (index.html, css/, js/ ...)
  2. /api/db       -> asli SQLite database  (data/smartbank.db)
  3. /api/sql      -> read-only SQL console (sirf SELECT chalega)
  4. /api/sql-log  -> abhi tak chali SQL queries ki list
  5. /api/schema   -> tables, columns aur row count

Tables ka structure js/schema.js se padha jaata hai, taaki browser aur
server dono ek hi schema use karein.
"""

import argparse
import collections
import json
import os
import pathlib
import re
import socket
import sqlite3
import sys
import threading
import time
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DB_FILES = {"main": "smartbank.db", "test": "smartbank_test.db"}
MAX_BODY = 1_000_000
MAX_ROWS = 500


# ---------------------------------------------------------------------------
# Schema - js/schema.js se padha jaata hai (single source of truth)
# ---------------------------------------------------------------------------
def load_schema():
    path = os.path.join(ROOT, "js", "schema.js")
    with open(path, encoding="utf-8") as f:
        src = f.read()
    match = re.search(r"/\* BEGIN SCHEMA \*/(.*)/\* END SCHEMA \*/", src, re.S)
    if not match:
        raise SystemExit("js/schema.js me BEGIN SCHEMA / END SCHEMA markers nahi mile")
    return json.loads(match.group(1))


SCHEMA = load_schema()


def sql_literal(value):
    """Query log me dikhane ke liye value ko SQL jaisa likhna."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    text = str(value)
    if len(text) > 60:
        text = text[:57] + "..."
    return "'" + text.replace("'", "''") + "'"


def render_sql(sql, params):
    parts = sql.split("?")
    out = parts[0]
    for i, part in enumerate(parts[1:]):
        out += (sql_literal(params[i]) if i < len(params) else "?") + part
    return out


# ---------------------------------------------------------------------------
# Database - ek SQLite file ke upar chhota sa layer
# ---------------------------------------------------------------------------
class Database:

    def __init__(self, name, filename, echo=False):
        self.name = name
        self.path = os.path.join(DATA_DIR, filename)
        self.lock = threading.RLock()
        self.log = collections.deque(maxlen=300)
        self.log_id = 0
        self.echo = echo
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        # WAL mode: har commit par poori disk sync nahi hoti, isliye Windows par bhi tez
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA synchronous=NORMAL")
        self.ensure_schema()

    # ---- schema ----------------------------------------------------------
    def spec(self, table):
        if table not in SCHEMA["tables"]:
            raise ValueError("unknown table: " + str(table))
        return SCHEMA["tables"][table]

    def columns(self, table):
        """{jsKey: (sql_column, kind)}"""
        return {c[0]: (c[1], c[3]) for c in self.spec(table)["columns"]}

    def ensure_schema(self):
        with self.lock:
            self.conn.execute("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)")
            row = self.conn.execute("SELECT value FROM meta WHERE key = 'schema_version'").fetchone()
            if row is None or row["value"] != str(SCHEMA["version"]):
                self.drop_tables()
            self.create_tables()
            self.conn.execute(
                "INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)",
                (str(SCHEMA["version"]),))
            self.conn.commit()

    def drop_tables(self):
        for table in reversed(list(SCHEMA["tables"].keys())):
            self.conn.execute("DROP TABLE IF EXISTS " + table)
        self.conn.commit()

    def create_tables(self):
        for table, spec in SCHEMA["tables"].items():
            lines = ["id INTEGER PRIMARY KEY AUTOINCREMENT"]
            for _js, col, sqltype, _kind in spec["columns"]:
                lines.append(col + " " + sqltype)
            lines.append("extra TEXT")        # schema ke bahar wali keys (JSON)
            for col, ref_table, ref_col in spec["foreign"]:
                lines.append("FOREIGN KEY (%s) REFERENCES %s(%s)" % (col, ref_table, ref_col))
            self.conn.execute("CREATE TABLE IF NOT EXISTS %s (\n  %s\n)" % (table, ",\n  ".join(lines)))

        for idx in ("transactions(acc_no)", "transactions(txn_id)", "notifications(user_id)",
                    "access_log(acc_no)", "accounts(user_id)", "command_log(user_id)"):
            name = "idx_" + re.sub(r"\W+", "_", idx).strip("_")
            self.conn.execute("CREATE INDEX IF NOT EXISTS %s ON %s" % (name, idx))
        self.conn.commit()

    # ---- conversion JS <-> SQL ---------------------------------------------
    @staticmethod
    def encode(value, kind):
        if value is None:
            return None
        if kind == "bool":
            return 1 if value else 0
        if kind == "json":
            return json.dumps(value)
        if kind == "int":
            return int(round(float(value)))
        if kind == "real":
            return float(value)
        return str(value)

    @staticmethod
    def decode(value, kind):
        if kind == "bool":
            return bool(value)
        if value is None:
            return None
        if kind == "json":
            try:
                return json.loads(value)
            except ValueError:
                return None
        if kind == "real" and float(value).is_integer():
            return int(value)
        return value

    def row_to_js(self, table, sqlrow):
        if sqlrow is None:
            return None
        out = {"id": sqlrow["id"]}
        for js, col, _t, kind in self.spec(table)["columns"]:
            value = self.decode(sqlrow[col], kind)
            if value is not None:
                out[js] = value
        if sqlrow["extra"]:
            try:
                out.update(json.loads(sqlrow["extra"]))
            except ValueError:
                pass
        return out

    def split_row(self, table, row, current_extra=None):
        cols = self.columns(table)
        names, values = [], []
        extra = dict(current_extra or {})
        for key, value in row.items():
            if key == "id":
                continue
            if key in cols:
                col, kind = cols[key]
                names.append(col)
                values.append(self.encode(value, kind))
            else:
                extra[key] = value
        if extra or current_extra is not None:
            names.append("extra")
            values.append(json.dumps(extra) if extra else None)
        return names, values

    # ---- execution + log -------------------------------------------------
    def run(self, sql, params=(), kind="read"):
        start = time.perf_counter()
        cur = self.conn.execute(sql, params)
        ms = (time.perf_counter() - start) * 1000
        self.log_id += 1
        entry = {"id": self.log_id, "time": time.strftime("%H:%M:%S"), "kind": kind,
                 "sql": render_sql(sql, list(params)), "ms": round(ms, 2)}
        self.log.append(entry)
        if self.echo and kind == "write":
            print("  [SQL] " + entry["sql"])
        return cur

    # ---- operations used by the website -------------------------------
    def select(self, table):
        self.spec(table)
        with self.lock:
            rows = self.run("SELECT * FROM %s ORDER BY id" % table).fetchall()
            return [self.row_to_js(table, r) for r in rows]

    def insert(self, table, row):
        self.spec(table)
        names, values = self.split_row(table, row)
        sql = "INSERT INTO %s (%s) VALUES (%s)" % (table, ", ".join(names), ", ".join("?" * len(names)))
        with self.lock:
            cur = self.run(sql, values, "write")
            self.conn.commit()
            new = self.conn.execute("SELECT * FROM %s WHERE id = ?" % table, (cur.lastrowid,)).fetchone()
            return self.row_to_js(table, new)

    def update(self, table, row_id, changes):
        self.spec(table)
        with self.lock:
            old = self.conn.execute("SELECT * FROM %s WHERE id = ?" % table, (row_id,)).fetchone()
            if old is None:
                return None
            cols = self.columns(table)
            has_extra = any(k not in cols and k != "id" for k in changes)
            current = json.loads(old["extra"]) if (has_extra and old["extra"]) else ({} if has_extra else None)
            names, values = self.split_row(table, changes, current)
            if not names:
                return self.row_to_js(table, old)
            sql = "UPDATE %s SET %s WHERE id = ?" % (table, ", ".join(n + " = ?" for n in names))
            self.run(sql, values + [row_id], "write")
            self.conn.commit()
            new = self.conn.execute("SELECT * FROM %s WHERE id = ?" % table, (row_id,)).fetchone()
            return self.row_to_js(table, new)

    def delete_rows(self, table, ids):
        self.spec(table)
        ids = [int(i) for i in ids]
        if not ids:
            return 0
        with self.lock:
            sql = "DELETE FROM %s WHERE id IN (%s)" % (table, ", ".join("?" * len(ids)))
            cur = self.run(sql, ids, "write")
            self.conn.commit()
            return cur.rowcount

    def truncate(self, table):
        self.spec(table)
        with self.lock:
            self.run("DELETE FROM %s" % table, (), "write")
            self.conn.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))
            self.conn.commit()

    def drop(self):
        with self.lock:
            self.drop_tables()
            self.create_tables()
            self.log_id += 1
            self.log.append({"id": self.log_id, "time": time.strftime("%H:%M:%S"), "kind": "write",
                             "sql": "DROP TABLE ... ; CREATE TABLE ...  -- database reset", "ms": 0})
            if self.echo:
                print("  [SQL] database reset - saari tables dobara bani")

    # ---- read-only SQL console ----------------------------------------
    def readonly_query(self, sql):
        sql = (sql or "").strip().rstrip(";").strip()
        if not sql:
            raise ValueError("Query khaali hai")
        if ";" in sql:
            raise ValueError("Ek baar me ek hi query chalao")
        if not re.match(r"(?is)^(select|with|explain|pragma\s+table_info)\b", sql):
            raise ValueError("Ye console read-only hai - sirf SELECT queries chalti hain")

        uri = pathlib.Path(self.path).as_uri() + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True)
        try:
            start = time.perf_counter()
            cur = conn.execute(sql)
            cols = [d[0] for d in (cur.description or [])]
            rows = [list(r) for r in cur.fetchmany(MAX_ROWS)]
            ms = (time.perf_counter() - start) * 1000
        finally:
            conn.close()

        with self.lock:
            self.log_id += 1
            self.log.append({"id": self.log_id, "time": time.strftime("%H:%M:%S"),
                             "kind": "console", "sql": sql, "ms": round(ms, 2)})
        return {"columns": cols, "rows": rows, "truncated": len(rows) == MAX_ROWS, "ms": round(ms, 2)}

    def schema_info(self):
        with self.lock:
            tables = []
            for table, spec in SCHEMA["tables"].items():
                info = self.conn.execute("PRAGMA table_info(%s)" % table).fetchall()
                count = self.conn.execute("SELECT COUNT(*) FROM %s" % table).fetchone()[0]
                tables.append({
                    "name": table,
                    "about": spec.get("about", ""),
                    "count": count,
                    "columns": [{"name": c["name"], "type": c["type"], "pk": bool(c["pk"])} for c in info],
                    "foreign": spec["foreign"],
                })
        size = os.path.getsize(self.path) if os.path.exists(self.path) else 0
        return {"tables": tables, "file": self.rel_path(), "bytes": size}

    def rel_path(self):
        try:
            return os.path.relpath(self.path, ROOT).replace("\\", "/")
        except ValueError:                      # alag drive par ho (jaise tests me)
            return self.path.replace("\\", "/")


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------
class SmartBankHandler(SimpleHTTPRequestHandler):

    # keep-alive: browser ek hi connection baar baar use kare (bahut tez)
    protocol_version = "HTTP/1.1"
    databases = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # browser purani JS cache na kare
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("  [HTTP] %s\n" % (fmt % args))

    def pick_db(self, query):
        name = self.headers.get("X-SB-DB") or (query.get("db") or ["main"])[0]
        if name not in self.databases:
            name = "main"
        return self.databases[name]

    def send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            raise ValueError("Request bahut badi hai")
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    # ---- GET ---------------------------------------------------------------
    def do_GET(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)

        if url.path.startswith("/data/") or url.path.startswith("/.") or "/." in url.path:
            self.send_error(403, "Not allowed")
            return

        if url.path == "/favicon.ico":          # browser apne aap maangta hai
            with open(os.path.join(ROOT, "favicon.svg"), "rb") as f:
                icon = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "image/svg+xml")
            self.send_header("Content-Length", str(len(icon)))
            self.end_headers()
            self.wfile.write(icon)
            return

        if url.path == "/api/health":
            db = self.pick_db(query)
            self.send_json({"ok": True, "driver": "sqlite", "file": db.rel_path(),
                            "sqlite": sqlite3.sqlite_version, "schema": SCHEMA["version"],
                            "python": sys.version.split()[0], "db": db.name})
            return

        if url.path == "/api/sql-log":
            db = self.pick_db(query)
            since = int((query.get("since") or ["0"])[0])
            with db.lock:
                entries = [e for e in db.log if e["id"] > since]
            self.send_json({"ok": True, "entries": entries})
            return

        if url.path == "/api/schema":
            db = self.pick_db(query)
            self.send_json(dict({"ok": True}, **db.schema_info()))
            return

        if url.path.startswith("/api/"):
            self.send_json({"ok": False, "error": "unknown endpoint"}, 404)
            return

        super().do_GET()

    # ---- POST --------------------------------------------------------------
    def do_POST(self):
        url = urlparse(self.path)
        query = parse_qs(url.query)
        try:
            body = self.read_json()
            db = self.pick_db(query)

            if url.path == "/api/db":
                self.send_json(self.handle_db(db, body))
                return

            if url.path == "/api/sql":
                # galat / write query user ki galti hai, server ki nahi - isliye 200 + ok:false
                try:
                    result = db.readonly_query(body.get("sql"))
                except (ValueError, sqlite3.Error) as err:
                    self.send_json({"ok": False, "error": str(err)})
                    return
                self.send_json(dict({"ok": True}, **result))
                return

            self.send_json({"ok": False, "error": "unknown endpoint"}, 404)
        except (ValueError, KeyError, TypeError, sqlite3.Error) as err:
            self.send_json({"ok": False, "error": str(err)}, 400)

    def handle_db(self, db, body):
        op = body.get("op")
        table = body.get("table")
        if op == "select":
            return {"ok": True, "rows": db.select(table)}
        if op == "insert":
            return {"ok": True, "row": db.insert(table, body.get("row") or {})}
        if op == "update":
            return {"ok": True, "row": db.update(table, int(body.get("id")), body.get("changes") or {})}
        if op == "delete":
            return {"ok": True, "deleted": db.delete_rows(table, body.get("ids") or [])}
        if op == "truncate":
            db.truncate(table)
            return {"ok": True}
        if op == "drop":
            db.drop()
            return {"ok": True}
        raise ValueError("unknown op: " + str(op))


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
class QuietServer(ThreadingHTTPServer):
    """Browser beech me hi page chhod de (link par click) to connection toot jaata hai.
    Ye normal hai - iska lamba traceback console me nahi chahiye."""
    daemon_threads = True

    def handle_error(self, request, client_address):
        if isinstance(sys.exc_info()[1], (ConnectionAbortedError, ConnectionResetError, BrokenPipeError)):
            return
        super().handle_error(request, client_address)


class IPv6Server(QuietServer):
    address_family = socket.AF_INET6


def make_server(port, tries=10):
    last = None
    for p in range(port, port + tries):
        try:
            return QuietServer(("127.0.0.1", p), SmartBankHandler), p
        except OSError as err:
            last = err
    raise SystemExit("Koi free port nahi mila (%s)" % last)


def also_listen_ipv6(port):
    """Windows par 'localhost' pehle IPv6 (::1) try karta hai. Wahan koi na sune
    to har request me ~1 second ki deri hoti hai - isliye ::1 par bhi sunte hain.
    Sirf apne computer ke liye (bahar se koi connect nahi kar sakta)."""
    try:
        srv = IPv6Server(("::1", port), SmartBankHandler)
    except OSError:
        return None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    parser = argparse.ArgumentParser(description="SmartBank local server (SQLite)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="browser apne aap mat kholo")
    parser.add_argument("--reset", action="store_true", help="database mita ke naya shuru karo")
    parser.add_argument("--quiet", action="store_true", help="SQL statements console me mat dikhao")
    args = parser.parse_args()

    # har line turant dikhe (output pipe me jaaye tab bhi)
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except (AttributeError, ValueError):
        pass

    os.makedirs(DATA_DIR, exist_ok=True)
    if args.reset:
        for f in DB_FILES.values():
            path = os.path.join(DATA_DIR, f)
            if os.path.exists(path):
                os.remove(path)

    SmartBankHandler.databases = {
        name: Database(name, fname, echo=(name == "main" and not args.quiet))
        for name, fname in DB_FILES.items()
    }

    server, port = make_server(args.port)
    server6 = also_listen_ipv6(port)
    url = "http://127.0.0.1:%d/" % port

    print("=" * 62)
    print("  SmartBank server chal raha hai")
    print("  Website  : " + url)
    print("  Database : " + SmartBankHandler.databases["main"].rel_path()
          + "  (SQLite " + sqlite3.sqlite_version + ")")
    print("  Band karne ke liye is window me Ctrl+C dabao")
    print("=" * 62)
    if not args.quiet:
        print("  Neeche har INSERT / UPDATE / DELETE dikhega:\n")

    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server band ho gaya.")
    finally:
        server.server_close()
        if server6 is not None:
            server6.shutdown()
            server6.server_close()
        for db in SmartBankHandler.databases.values():
            db.conn.close()


if __name__ == "__main__":
    main()
