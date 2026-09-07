import json
import os
import sqlite3
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "central_prices.db"


SEED_CATEGORIES = ["قواطع", "كيبلات", "إنارة", "إكسسوارات", "مفاتيح", "أنابيب", "عدد"]
SEED_PRODUCTS = [
    {
        "name": "قاطع كهرباء شنايدر 32 أمبير",
        "category": "قواطع",
        "code": "BRK-SCH-32",
        "aisle": "A1",
        "supplier": "مخزن الرشيد",
        "price": 18500,
        "cost": 15200,
        "stock": 42,
        "minStock": 10,
        "note": "أصلي، ضمان سنة",
        "image": "",
    },
    {
        "name": "كيبل نحاس 2.5 ملم عراقي",
        "category": "كيبلات",
        "code": "CBL-CU-25",
        "aisle": "B3",
        "supplier": "شركة النور",
        "price": 1150,
        "cost": 930,
        "stock": 620,
        "minStock": 180,
        "note": "السعر للمتر",
        "image": "",
    },
    {
        "name": "مصباح LED بانل 18 واط",
        "category": "إنارة",
        "code": "LED-PNL-18",
        "aisle": "C2",
        "supplier": "ضياء بغداد",
        "price": 6500,
        "cost": 5100,
        "stock": 8,
        "minStock": 15,
        "note": "إضاءة بيضاء",
        "image": "",
    },
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                code TEXT NOT NULL UNIQUE,
                aisle TEXT,
                supplier TEXT,
                price REAL DEFAULT 0,
                cost REAL DEFAULT 0,
                stock REAL DEFAULT 0,
                minStock REAL DEFAULT 0,
                note TEXT,
                image TEXT,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                code TEXT NOT NULL,
                active INTEGER DEFAULT 1,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        count = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO categories (id, name) VALUES (?, ?)",
                [(str(uuid.uuid4()), name) for name in SEED_CATEGORIES],
            )
        count = conn.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if count == 0:
            for product in SEED_PRODUCTS:
                product["id"] = str(uuid.uuid4())
                columns = ", ".join(product.keys())
                placeholders = ", ".join(["?"] * len(product))
                conn.execute(
                    f"INSERT INTO products ({columns}) VALUES ({placeholders})",
                    list(product.values()),
                )
            conn.execute("INSERT INTO activity (message) VALUES (?)", ("تم إنشاء قاعدة البيانات المركزية",))
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO users (id, name, role, code, active) VALUES (?, ?, ?, ?, ?)",
                [
                    (str(uuid.uuid4()), "مدير المجمع", "manager", "1234", 1),
                    (str(uuid.uuid4()), "عامل مبيعات", "worker", "1234", 1),
                ],
            )


def rows(query, params=()):
    with connect() as conn:
        return [dict(row) for row in conn.execute(query, params).fetchall()]


def one(query, params=()):
    with connect() as conn:
        row = conn.execute(query, params).fetchone()
        return dict(row) if row else None


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/data":
            self.json(
                {
                    "products": rows("SELECT * FROM products ORDER BY updatedAt DESC"),
                    "categories": [row["name"] for row in rows("SELECT name FROM categories ORDER BY name")],
                    "activity": [
                        row["message"]
                        for row in rows("SELECT message FROM activity ORDER BY id DESC LIMIT 40")
                    ],
                    "users": rows("SELECT id, name, role, code, active FROM users ORDER BY role, name"),
                }
            )
            return
        super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/products":
            data = self.body()
            product_id = data.get("id") or str(uuid.uuid4())
            values = {
                "id": product_id,
                "name": data.get("name", "").strip(),
                "category": data.get("category", "").strip(),
                "code": data.get("code", "").strip() or f"NO-BARCODE-{product_id}",
                "aisle": data.get("aisle", ""),
                "supplier": data.get("supplier", ""),
                "price": float(data.get("price") or 0),
                "cost": float(data.get("cost") or 0),
                "stock": float(data.get("stock") or 0),
                "minStock": float(data.get("minStock") or 0),
                "note": data.get("note", ""),
                "image": data.get("image", ""),
            }
            if not values["name"]:
                self.json({"error": "name is required"}, 400)
                return
            with connect() as conn:
                columns = ", ".join(values.keys())
                placeholders = ", ".join(["?"] * len(values))
                updates = ", ".join([f"{key}=excluded.{key}" for key in values.keys() if key != "id"])
                conn.execute(
                    f"""
                    INSERT INTO products ({columns})
                    VALUES ({placeholders})
                    ON CONFLICT(id) DO UPDATE SET {updates}, updatedAt=CURRENT_TIMESTAMP
                    """,
                    list(values.values()),
                )
                conn.execute("INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)", (str(uuid.uuid4()), values["category"]))
                conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تم حفظ المادة: {values['name']}",))
            self.json(one("SELECT * FROM products WHERE id = ?", (product_id,)))
            return
        if path == "/api/categories":
            data = self.body()
            name = data.get("name", "").strip()
            if not name:
                self.json({"error": "name is required"}, 400)
                return
            with connect() as conn:
                conn.execute("INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)", (str(uuid.uuid4()), name))
                conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تمت إضافة تصنيف: {name}",))
            self.json({"name": name})
            return
        if path == "/api/users":
            data = self.body()
            user_id = data.get("id") or str(uuid.uuid4())
            values = {
                "id": user_id,
                "name": data.get("name", "").strip(),
                "role": data.get("role", "worker").strip(),
                "code": data.get("code", "1234").strip(),
                "active": 1 if data.get("active", True) else 0,
            }
            if not values["name"] or not values["code"]:
                self.json({"error": "name and code are required"}, 400)
                return
            with connect() as conn:
                conn.execute(
                    """
                    INSERT INTO users (id, name, role, code, active)
                    VALUES (:id, :name, :role, :code, :active)
                    ON CONFLICT(id) DO UPDATE SET
                        name=excluded.name,
                        role=excluded.role,
                        code=excluded.code,
                        active=excluded.active,
                        updated_at=CURRENT_TIMESTAMP
                    """,
                    values,
                )
                conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تم حفظ المستخدم: {values['name']}",))
            self.json({"ok": True})
            return
        self.json({"error": "not found"}, 404)

    def do_PUT(self):
        path = urlparse(self.path).path
        if path.startswith("/api/categories/"):
            from urllib.parse import unquote
            old = unquote(path.split("/")[-1])
            data = self.body()
            new = data.get("name", "").strip()
            if not new:
                self.json({"error": "name is required"}, 400)
                return
            with connect() as conn:
                conn.execute("UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?", (new, old))
                conn.execute("UPDATE products SET category = ? WHERE category = ?", (new, old))
                conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تم تعديل التصنيف من {old} إلى {new}",))
            self.json({"name": new})
            return
        self.json({"error": "not found"}, 404)

    def do_DELETE(self):
        path = urlparse(self.path).path
        if path.startswith("/api/categories/"):
            from urllib.parse import unquote
            name = unquote(path.split("/")[-1])
            used = one("SELECT COUNT(*) AS count FROM products WHERE category = ?", (name,))
            if used and used["count"] > 0:
                self.json({"error": "category is used", "count": used["count"]}, 409)
                return
            with connect() as conn:
                conn.execute("DELETE FROM categories WHERE name = ?", (name,))
                conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تم حذف التصنيف: {name}",))
            self.json({"ok": True})
            return
        if path.startswith("/api/products/"):
            product_id = path.split("/")[-1]
            product = one("SELECT name FROM products WHERE id = ?", (product_id,))
            with connect() as conn:
                conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
                if product:
                    conn.execute("INSERT INTO activity (message) VALUES (?)", (f"تم حذف المادة: {product['name']}",))
            self.json({"ok": True})
            return
        self.json({"error": "not found"}, 404)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def json(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "5180"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Electric prices app is running at http://127.0.0.1:{port}/")
    server.serve_forever()
