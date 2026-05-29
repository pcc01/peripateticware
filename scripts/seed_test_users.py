"""
seed_test_users.py
==================
Generates bcrypt hashes and upserts the four test users into the database.

Run directly from Windows (while Docker stack is up):
    python scripts\seed_test_users.py

Or pass a custom password:
    python scripts\seed_test_users.py MyPassword99

Or via the PowerShell wrapper:
    powershell -ExecutionPolicy Bypass -File .\scripts\Seed-TestUsers.ps1

Or inside the backend container (legacy):
    docker exec peripateticware-backend python3 /tmp/seed_test_users.py
"""

import os
import sys
import socket

# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------
PASSWORD = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TEST_PASSWORD", "SecurePassword123")

# ---------------------------------------------------------------------------
# Test users (fixed UUIDs -- same every run so rows are stable)
# ---------------------------------------------------------------------------
TEST_USERS = [
    {
        "id":         "aa000000-0000-0000-0000-000000000001",
        "email":      "teacher@example.com",
        "username":   "teacher_test",
        "full_name":  "Test Teacher",
        "first_name": "Test",
        "last_name":  "Teacher",
        "role":       "TEACHER",
    },
    {
        "id":         "aa000000-0000-0000-0000-000000000002",
        "email":      "student@example.com",
        "username":   "student_test",
        "full_name":  "Test Student",
        "first_name": "Test",
        "last_name":  "Student",
        "role":       "STUDENT",
    },
    {
        "id":         "aa000000-0000-0000-0000-000000000003",
        "email":      "parent@example.com",
        "username":   "parent_test",
        "full_name":  "Test Parent",
        "first_name": "Test",
        "last_name":  "Parent",
        "role":       "PARENT",
    },
    {
        "id":         "aa000000-0000-0000-0000-000000000004",
        "email":      "admin@example.com",
        "username":   "admin_test",
        "full_name":  "Test Admin",
        "first_name": "Test",
        "last_name":  "Admin",
        "role":       "ADMIN",
    },
]

# ---------------------------------------------------------------------------
# bcrypt hashing (no passlib -- it is broken on bcrypt 4.x)
# ---------------------------------------------------------------------------
try:
    import bcrypt
except ImportError:
    print("ERROR: bcrypt is not installed.  Run:  pip install bcrypt")
    sys.exit(1)

def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")

print()
print("=" * 54)
print("  Peripateticware -- Seed Test Users")
print("=" * 54)
print(f"  Password: {PASSWORD}")
print()

print("Hashing password for all users...")
hashes = {u["email"]: hash_pw(PASSWORD) for u in TEST_USERS}
print("  Done.")
print()

# ---------------------------------------------------------------------------
# Database connection -- auto-detect Docker-internal vs. local host
# ---------------------------------------------------------------------------
try:
    import psycopg2
except ImportError:
    print("ERROR: psycopg2 is not installed.")
    print("       Run:  pip install psycopg2-binary")
    sys.exit(1)

DB_USER = "peripateticware_user"
DB_PASS = "peripateticware_secure_password_dev"
DB_NAME = "peripateticware"
DB_PORT = 5432

# If DATABASE_URL is set, parse it; otherwise auto-detect host.
raw_url = os.environ.get("DATABASE_URL", "")
raw_url = raw_url.replace("postgresql+asyncpg://", "postgresql://")

if raw_url:
    db_url = raw_url
else:
    # Try 'postgres' (Docker internal) first, fall back to 'localhost'.
    def _host_reachable(host, port, timeout=2):
        try:
            socket.setdefaulttimeout(timeout)
            socket.socket(socket.AF_INET, socket.SOCK_STREAM).connect((host, port))
            return True
        except OSError:
            return False

    host = "postgres" if _host_reachable("postgres", DB_PORT) else "localhost"
    db_url = f"postgresql://{DB_USER}:{DB_PASS}@{host}:{DB_PORT}/{DB_NAME}"

print(f"Connecting to database...")
try:
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    cur = conn.cursor()
    print("  Connected.")
except Exception as e:
    # If we used 'postgres' hostname and it failed, retry with localhost
    if "@postgres:" in db_url:
        db_url = db_url.replace("@postgres:", "@localhost:")
        print(f"  Retrying with localhost...")
        try:
            conn = psycopg2.connect(db_url)
            conn.autocommit = True
            cur = conn.cursor()
            print("  Connected via localhost.")
        except Exception as e2:
            print(f"ERROR connecting: {e2}")
            print("Hint: make sure Docker is running (docker-compose up -d)")
            sys.exit(1)
    else:
        print(f"ERROR connecting: {e}")
        print("Hint: make sure Docker is running (docker-compose up -d)")
        sys.exit(1)

print()

# ---------------------------------------------------------------------------
# Detect role column type (VARCHAR vs enum)
# ---------------------------------------------------------------------------
cur.execute("""
    SELECT data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role'
    LIMIT 1;
""")
row = cur.fetchone()
if row:
    data_type, udt_name = row
    role_is_enum = (data_type == "USER-DEFINED")
else:
    role_is_enum = False

# ---------------------------------------------------------------------------
# Detect optional columns
# ---------------------------------------------------------------------------
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name = 'users';")
existing_cols = {r[0] for r in cur.fetchall()}
has_first_name = "first_name" in existing_cols
has_last_name  = "last_name"  in existing_cols

# ---------------------------------------------------------------------------
# Upsert each user
# ---------------------------------------------------------------------------
print("Upserting test users...")
for u in TEST_USERS:
    pw_hash  = hashes[u["email"]]
    role_val = u["role"].lower() if role_is_enum else u["role"]

    cols   = ["id", "email", "username", "hashed_password", "role", "full_name", "is_active"]
    vals   = [u["id"], u["email"], u["username"], pw_hash, role_val, u["full_name"], True]
    update = [
        "hashed_password = EXCLUDED.hashed_password",
        "role            = EXCLUDED.role",
        "full_name       = EXCLUDED.full_name",
        "is_active       = EXCLUDED.is_active",
    ]

    if has_first_name:
        cols.append("first_name"); vals.append(u["first_name"])
        update.append("first_name = EXCLUDED.first_name")
    if has_last_name:
        cols.append("last_name"); vals.append(u["last_name"])
        update.append("last_name  = EXCLUDED.last_name")

    sql = f"""
        INSERT INTO users ({", ".join(cols)})
        VALUES ({", ".join(["%s"] * len(vals))})
        ON CONFLICT (email) DO UPDATE SET {", ".join(update)};
    """

    try:
        cur.execute(sql, vals)
        print(f"  OK  {u['role']:<8}  {u['email']}")
    except Exception as e:
        print(f"  FAIL  {u['email']}: {e}")
        if not role_is_enum:
            try:
                vals[cols.index("role")] = u["role"].lower()
                cur.execute(sql, vals)
                print(f"         -> retried with lowercase role: OK")
            except Exception as e2:
                print(f"         -> retry also failed: {e2}")

cur.close()
conn.close()

print()
print("=" * 54)
print("  Done!  Log in with any of these accounts:")
print("=" * 54)
print(f"  Password (all users):  {PASSWORD}")
print()
for u in TEST_USERS:
    print(f"  {u['role']:<8}  {u['email']}")
print()
print("  Login:  POST /api/v1/auth/login")
print('  Body:   {"email": "...", "password": "..."}')
print()
