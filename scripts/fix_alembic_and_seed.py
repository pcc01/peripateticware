"""
fix_alembic_and_seed.py
=======================
One-shot script to:
  1. Stamp alembic_version at the current head (bypasses the broken chain)
  2. Add HOMESCHOOL to the userrole enum (if not already there)
  3. Seed / upsert all test users including the new homeschool accounts

Run while Docker is up:
    python scripts\fix_alembic_and_seed.py

Optional custom password:
    python scripts\fix_alembic_and_seed.py MyPassword99
"""

import os
import sys
import socket

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
HEAD_REVISION  = "20260531_add_homeschool_userrole"
PASSWORD       = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TEST_PASSWORD", "SecurePassword123")

TEST_USERS = [
    {"id": "aa000000-0000-0000-0000-000000000001", "email": "teacher@example.com",    "username": "teacher_test",    "full_name": "Test Teacher",  "first_name": "Test",  "last_name": "Teacher", "role": "TEACHER"},
    {"id": "aa000000-0000-0000-0000-000000000002", "email": "student@example.com",    "username": "student_test",    "full_name": "Test Student",  "first_name": "Test",  "last_name": "Student", "role": "STUDENT"},
    {"id": "aa000000-0000-0000-0000-000000000003", "email": "parent@example.com",     "username": "parent_test",     "full_name": "Test Parent",   "first_name": "Test",  "last_name": "Parent",  "role": "PARENT"},
    {"id": "aa000000-0000-0000-0000-000000000004", "email": "admin@example.com",      "username": "admin_test",      "full_name": "Test Admin",    "first_name": "Test",  "last_name": "Admin",   "role": "ADMIN"},
    {"id": "aa000000-0000-0000-0000-000000000005", "email": "homeschool@example.com", "username": "homeschool_test", "full_name": "Sarah Rivera",  "first_name": "Sarah", "last_name": "Rivera",  "role": "HOMESCHOOL"},
    {"id": "aa000000-0000-0000-0000-000000000006", "email": "child1@example.com",     "username": "child1_test",     "full_name": "Emma Rivera",   "first_name": "Emma",  "last_name": "Rivera",  "role": "STUDENT"},
    {"id": "aa000000-0000-0000-0000-000000000007", "email": "child2@example.com",     "username": "child2_test",     "full_name": "Lucas Rivera",  "first_name": "Lucas", "last_name": "Rivera",  "role": "STUDENT"},
]

# ---------------------------------------------------------------------------
# Dependencies
# ---------------------------------------------------------------------------
try:
    import bcrypt
except ImportError:
    print("ERROR: pip install bcrypt"); sys.exit(1)

try:
    import psycopg2
except ImportError:
    print("ERROR: pip install psycopg2-binary"); sys.exit(1)

# ---------------------------------------------------------------------------
# DB connection
# ---------------------------------------------------------------------------
DB_USER = "peripateticware_user"
DB_PASS = "peripateticware_secure_password_dev"
DB_NAME = "peripateticware"
DB_PORT = 5432

raw_url = os.environ.get("DATABASE_URL", "").replace("postgresql+asyncpg://", "postgresql://")

if raw_url:
    db_url = raw_url
else:
    def _reachable(host, port=DB_PORT, timeout=2):
        try:
            socket.setdefaulttimeout(timeout)
            socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
            return True
        except OSError:
            return False
    host = "postgres" if _reachable("postgres") else "localhost"
    db_url = f"postgresql://{DB_USER}:{DB_PASS}@{host}:{DB_PORT}/{DB_NAME}"

print("\n" + "=" * 56)
print("  Peripateticware — Fix Alembic + Seed Users")
print("=" * 56)
print(f"  Connecting to: {db_url.split('@')[-1]}")

def connect(url):
    conn = psycopg2.connect(url)
    conn.autocommit = True
    return conn

try:
    conn = connect(db_url)
    print("  Connected.\n")
except Exception:
    fallback = db_url.replace("@postgres:", "@localhost:")
    try:
        conn = connect(fallback)
        print("  Connected via localhost.\n")
    except Exception as e:
        print(f"  ERROR: {e}\n  Is Docker running?")
        sys.exit(1)

cur = conn.cursor()

# ---------------------------------------------------------------------------
# Step 1 — Fix alembic_version
# ---------------------------------------------------------------------------
print("── Step 1: Fix alembic_version ──────────────────────")

cur.execute("""
    CREATE TABLE IF NOT EXISTS alembic_version (
        version_num VARCHAR(32) NOT NULL,
        CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
    );
""")

cur.execute("SELECT version_num FROM alembic_version;")
rows = cur.fetchall()
print(f"  Current alembic_version rows: {[r[0] for r in rows]}")

# Wipe any stale/partial stamps and set the single correct head
cur.execute("DELETE FROM alembic_version;")
cur.execute("INSERT INTO alembic_version (version_num) VALUES (%s);", (HEAD_REVISION,))
print(f"  Stamped at head: {HEAD_REVISION}")

# ---------------------------------------------------------------------------
# Step 2 — Add HOMESCHOOL to userrole enum
# ---------------------------------------------------------------------------
print("\n── Step 2: Check userrole enum (if it exists) ───────")

cur.execute("SELECT 1 FROM pg_type WHERE typname = 'userrole' LIMIT 1;")
enum_exists = cur.fetchone() is not None

if enum_exists:
    cur.execute("""
        SELECT enumlabel FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'userrole';
    """)
    existing_values = {r[0] for r in cur.fetchall()}
    print(f"  Existing enum values: {sorted(existing_values)}")
    if "HOMESCHOOL" not in existing_values:
        cur.execute("ALTER TYPE userrole ADD VALUE 'HOMESCHOOL';")
        print("  Added HOMESCHOOL to enum ✓")
        # PostgreSQL requires a NEW connection to see the freshly added enum value.
        cur.close()
        conn.close()
        print("  Reconnecting so new enum value is visible...")
        conn = connect(db_url)
        cur  = conn.cursor()
        print("  Reconnected ✓")
    else:
        print("  HOMESCHOOL already in enum ✓")
else:
    print("  userrole is VARCHAR (no enum) — no ALTER TYPE needed ✓")

# ---------------------------------------------------------------------------
# Step 2b — Ensure users_role_check constraint includes HOMESCHOOL
# ---------------------------------------------------------------------------
print("\n── Step 2b: Fix users_role_check constraint ─────────")
cur.execute("""
    SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conname = 'users_role_check' LIMIT 1;
""")
row = cur.fetchone()
if row and 'HOMESCHOOL' not in row[0]:
    cur.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check")
    cur.execute("""
        ALTER TABLE users ADD CONSTRAINT users_role_check
        CHECK (role::text = ANY (
            ARRAY['STUDENT','TEACHER','PARENT','ADMIN','HOMESCHOOL']::text[]
        ))
    """)
    print("  Constraint updated to include HOMESCHOOL ✓")
elif row:
    print("  Constraint already includes HOMESCHOOL ✓")
else:
    print("  No users_role_check constraint found ✓")

# ---------------------------------------------------------------------------
# Step 3 — Detect schema, hash passwords, upsert users
# ---------------------------------------------------------------------------
print("\n── Step 3: Seed test users ──────────────────────────")

cur.execute("SELECT data_type FROM information_schema.columns WHERE table_name='users' AND column_name='role' LIMIT 1;")
row = cur.fetchone()
role_is_enum = row and row[0] == "USER-DEFINED"

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='users';")
cols_in_db = {r[0] for r in cur.fetchall()}
has_first = "first_name" in cols_in_db
has_last  = "last_name"  in cols_in_db

print(f"  Hashing password for {len(TEST_USERS)} users...")
hashes = {u["email"]: bcrypt.hashpw(PASSWORD.encode(), bcrypt.gensalt(12)).decode() for u in TEST_USERS}

for u in TEST_USERS:
    role_val = u["role"].lower() if role_is_enum else u["role"]
    cols   = ["id", "email", "username", "hashed_password", "role", "full_name", "is_active"]
    vals   = [u["id"], u["email"], u["username"], hashes[u["email"]], role_val, u["full_name"], True]
    update = [
        "hashed_password = EXCLUDED.hashed_password",
        "role            = EXCLUDED.role",
        "full_name       = EXCLUDED.full_name",
        "is_active       = EXCLUDED.is_active",
    ]
    if has_first:
        cols.append("first_name"); vals.append(u["first_name"])
        update.append("first_name = EXCLUDED.first_name")
    if has_last:
        cols.append("last_name"); vals.append(u["last_name"])
        update.append("last_name  = EXCLUDED.last_name")

    sql = f"""
        INSERT INTO users ({", ".join(cols)})
        VALUES ({", ".join(["%s"] * len(vals))})
        ON CONFLICT (email) DO UPDATE SET {", ".join(update)};
    """
    try:
        cur.execute(sql, vals)
        print(f"  OK  {u['role']:<12}  {u['email']}")
    except Exception as e:
        # Retry with uppercase role if enum case mismatch
        try:
            vals[cols.index("role")] = u["role"].upper()
            cur.execute(sql, vals)
            print(f"  OK  {u['role']:<12}  {u['email']}  (uppercase retry)")
        except Exception as e2:
            print(f"  FAIL  {u['email']}: {e2}")

cur.close()
conn.close()

print("\n" + "=" * 56)
print("  Done!")
print(f"  Password (all users): {PASSWORD}")
print()
print(f"  {'ROLE':<12}  EMAIL")
print(f"  {'-'*12}  {'─'*30}")
for u in TEST_USERS:
    print(f"  {u['role']:<12}  {u['email']}")
print()
print("  Login: POST /api/v1/auth/login")
print('  Body:  {"email": "...", "password": "..."}')
print()
