"""Seed script for the Sales Data MCP Server SQLite database.

Creates and populates mcp/sales_data.db with realistic mock data.
Run: python seed_database.py
"""

import random
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

random.seed(42)

DB_PATH = Path(__file__).parent / "sales_data.db"

# --- Schema ---

SCHEMA = """
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    industry TEXT NOT NULL,
    tier TEXT NOT NULL CHECK(tier IN ('enterprise', 'mid-market', 'startup')),
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sales_reps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    region TEXT NOT NULL,
    quota REAL NOT NULL,
    hire_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('software', 'hardware', 'services', 'consulting')),
    price REAL NOT NULL,
    description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
    title TEXT NOT NULL,
    value REAL NOT NULL,
    stage TEXT NOT NULL CHECK(stage IN ('prospecting', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost')),
    probability REAL NOT NULL,
    created_at TEXT NOT NULL,
    close_date TEXT
);

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    deal_id INTEGER NOT NULL REFERENCES deals(id),
    product_id INTEGER NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total REAL NOT NULL,
    order_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'shipped', 'delivered', 'returned'))
);

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    sales_rep_id INTEGER NOT NULL REFERENCES sales_reps(id),
    deal_id INTEGER REFERENCES deals(id),
    type TEXT NOT NULL CHECK(type IN ('call', 'email', 'meeting', 'demo', 'follow_up')),
    summary TEXT NOT NULL,
    date TEXT NOT NULL
);
"""

# --- Mock Data ---

INDUSTRIES = ["Technology", "Healthcare", "Finance", "Retail", "Manufacturing"]
TIERS = ["enterprise", "mid-market", "startup"]
REGIONS = ["North", "South", "East", "West"]
STAGES = ["prospecting", "qualification", "proposal", "negotiation", "closed_won", "closed_lost"]
STAGE_PROBABILITIES = {
    "prospecting": 0.10,
    "qualification": 0.25,
    "proposal": 0.50,
    "negotiation": 0.75,
    "closed_won": 1.00,
    "closed_lost": 0.00,
}
ACTIVITY_TYPES = ["call", "email", "meeting", "demo", "follow_up"]
ORDER_STATUSES = ["pending", "shipped", "delivered", "returned"]

COMPANIES = [
    ("Alice Chen", "TechNova Solutions", "Technology"),
    ("Brian Foster", "MedCore Systems", "Healthcare"),
    ("Carla Rodriguez", "FinEdge Capital", "Finance"),
    ("David Park", "RetailPulse Inc", "Retail"),
    ("Elena Volkov", "PrecisionMfg Co", "Manufacturing"),
    ("Frank Nguyen", "CloudBridge AI", "Technology"),
    ("Grace Okafor", "HealthWave Labs", "Healthcare"),
    ("Henry Walsh", "CapitalStream Partners", "Finance"),
    ("Irene Martinez", "ShopSphere Global", "Retail"),
    ("James Kim", "SteelWorks Industries", "Manufacturing"),
    ("Karen Liu", "DataPilot Analytics", "Technology"),
    ("Leo Braun", "BioGenesis Health", "Healthcare"),
    ("Maria Santos", "TrustVault Financial", "Finance"),
    ("Nathan Cole", "UrbanMarket Group", "Retail"),
    ("Olivia Harris", "Apex Manufacturing", "Manufacturing"),
    ("Peter Zhang", "NexGen Software", "Technology"),
    ("Quinn O'Brien", "VitalCare Medical", "Healthcare"),
    ("Rachel Patel", "BlueChip Advisors", "Finance"),
    ("Sam Turner", "FreshCart Logistics", "Retail"),
    ("Tanya Ivanova", "QuantumForge Labs", "Technology"),
    ("Uma Desai", "PharmaBridge Corp", "Healthcare"),
    ("Victor Lam", "WealthSync Pro", "Finance"),
    ("Wendy Zhao", "GreenLeaf Retail", "Retail"),
    ("Xavier Morris", "TitanWorks Heavy Ind", "Manufacturing"),
    ("Yuki Tanaka", "CyberShield Security", "Technology"),
]

SALES_REPS_DATA = [
    ("Michael Thompson", "North", 750000),
    ("Sarah Johnson", "South", 680000),
    ("Robert Williams", "East", 720000),
    ("Jennifer Davis", "West", 690000),
    ("Christopher Brown", "North", 710000),
    ("Amanda Wilson", "South", 650000),
    ("Daniel Garcia", "East", 700000),
    ("Stephanie Miller", "West", 660000),
]

PRODUCTS_DATA = [
    ("Enterprise CRM Suite", "software", 15000, "Full-featured CRM with AI-powered insights and pipeline management"),
    ("Cloud Analytics Platform", "software", 8500, "Real-time analytics dashboard with custom reporting"),
    ("Security Compliance Toolkit", "software", 12000, "Automated compliance monitoring and audit trail"),
    ("Data Integration Hub", "software", 9500, "ETL platform connecting 200+ data sources"),
    ("AI Chatbot Builder", "software", 6000, "No-code conversational AI platform for customer support"),
    ("ProDesk Workstation X1", "hardware", 3200, "High-performance workstation for data science teams"),
    ("SecureNet Firewall 500", "hardware", 7500, "Enterprise-grade network security appliance"),
    ("CloudStorage Array NX", "hardware", 18000, "Scalable NAS with built-in deduplication"),
    ("SmartDisplay Conference Hub", "hardware", 4500, "55-inch interactive whiteboard for hybrid meetings"),
    ("Implementation & Onboarding", "services", 25000, "Full implementation with data migration and training"),
    ("Premium Support Plan", "services", 5000, "24/7 dedicated support with 1-hour SLA"),
    ("Custom API Development", "services", 35000, "Bespoke integration development and testing"),
    ("Digital Transformation Advisory", "consulting", 45000, "12-week strategic roadmap with executive coaching"),
    ("Cloud Migration Assessment", "consulting", 15000, "Infrastructure audit and migration planning"),
    ("Process Optimization Review", "consulting", 20000, "Workflow analysis and automation recommendations"),
]

DEAL_TITLES = [
    "Enterprise CRM rollout",
    "Cloud migration project",
    "Security compliance upgrade",
    "Data platform modernization",
    "AI chatbot deployment",
    "Hardware refresh cycle",
    "Managed services agreement",
    "Digital transformation initiative",
    "Analytics platform expansion",
    "Network infrastructure upgrade",
    "Support tier upgrade",
    "Custom integration project",
    "Process automation engagement",
    "Cloud storage expansion",
    "Conference tech refresh",
]

ACTIVITY_SUMMARIES = {
    "call": [
        "Discussed Q{q} budget allocation and project timeline",
        "Followed up on proposal sent last week - positive reception",
        "Quarterly business review call with stakeholders",
        "Cold call introduction - identified pain points in current system",
        "Technical requirements gathering call with IT team",
        "Pricing discussion and negotiation of volume discounts",
        "Executive sponsor alignment call",
        "Post-implementation check-in - very satisfied with results",
    ],
    "email": [
        "Sent revised proposal with updated pricing tier",
        "Shared case study from similar {industry} deployment",
        "Followed up on outstanding contract questions",
        "Sent product comparison matrix vs competitor",
        "Introduction email after trade show meeting",
        "Shared ROI calculator with projected savings",
        "Sent meeting recap and next steps",
        "Renewal reminder - contract expires in 30 days",
    ],
    "meeting": [
        "On-site discovery workshop with department heads",
        "Product demo for executive leadership team",
        "Technical architecture review session",
        "Contract negotiation meeting - close to agreement",
        "Quarterly business review with customer success team",
        "Joint planning session for Phase 2 rollout",
        "Vendor evaluation presentation to buying committee",
        "Kickoff meeting for new implementation project",
    ],
    "demo": [
        "Live demo of analytics dashboard for finance team",
        "Proof of concept walkthrough with technical leads",
        "Product demonstration for newly identified stakeholders",
        "Custom demo environment showcase with real data",
        "Competitive bake-off demo against incumbent solution",
        "Feature preview of upcoming Q{q} release",
    ],
    "follow_up": [
        "Checked in after demo - scheduling follow-up with CTO",
        "Touched base on implementation timeline",
        "Followed up on reference check conversations",
        "Reconnected after holiday break - deal still active",
        "Sent thank-you note after successful go-live",
        "Checked on user adoption metrics post-launch",
    ],
}


def random_date(start: date, end: date) -> str:
    delta = (end - start).days
    return (start + timedelta(days=random.randint(0, delta))).isoformat()


def random_phone() -> str:
    return f"+1-{random.randint(200,999)}-{random.randint(100,999)}-{random.randint(1000,9999)}"


def seed():
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)

    # --- Customers (25) ---
    customers = []
    for i, (name, company, industry) in enumerate(COMPANIES, 1):
        email = name.lower().replace(" ", ".") + "@" + company.lower().replace(" ", "").replace(".", "") + ".com"
        tier = random.choice(TIERS)
        created = random_date(date(2021, 1, 1), date(2023, 12, 31))
        customers.append((name, company, email, random_phone(), industry, tier, created))

    conn.executemany(
        "INSERT INTO customers (name, company, email, phone, industry, tier, created_at) VALUES (?,?,?,?,?,?,?)",
        customers,
    )

    # --- Sales Reps (8) ---
    reps = []
    for name, region, quota in SALES_REPS_DATA:
        email = name.lower().replace(" ", ".") + "@salesteam.com"
        hire = random_date(date(2019, 1, 1), date(2023, 6, 30))
        reps.append((name, email, region, quota, hire))

    conn.executemany(
        "INSERT INTO sales_reps (name, email, region, quota, hire_date) VALUES (?,?,?,?,?)",
        reps,
    )

    # --- Products (15) ---
    products = []
    for name, category, price, description in PRODUCTS_DATA:
        products.append((name, category, price, description))

    conn.executemany(
        "INSERT INTO products (name, category, price, description) VALUES (?,?,?,?)",
        products,
    )

    # --- Deals (60) ---
    deals = []
    for i in range(60):
        customer_id = random.randint(1, 25)
        rep_id = random.randint(1, 8)
        title = random.choice(DEAL_TITLES) + f" - {COMPANIES[customer_id - 1][1]}"
        stage = random.choice(STAGES)
        probability = STAGE_PROBABILITIES[stage] + random.uniform(-0.05, 0.05)
        probability = max(0, min(1, probability))
        value = round(random.uniform(10000, 250000), 2)
        created = random_date(date(2023, 1, 1), date(2024, 9, 30))
        close_date = None
        if stage in ("closed_won", "closed_lost"):
            close_date = random_date(date(2023, 6, 1), date(2024, 10, 31))
        elif stage in ("negotiation", "proposal"):
            close_date = random_date(date(2024, 10, 1), date(2025, 3, 31))
        deals.append((customer_id, rep_id, title, value, stage, round(probability, 2), created, close_date))

    conn.executemany(
        "INSERT INTO deals (customer_id, sales_rep_id, title, value, stage, probability, created_at, close_date) VALUES (?,?,?,?,?,?,?,?)",
        deals,
    )

    # --- Orders (120) ---
    # Only create orders for closed_won deals
    won_deal_ids = [
        i + 1 for i, d in enumerate(deals) if d[4] == "closed_won"
    ]
    orders = []
    for i in range(120):
        if won_deal_ids:
            deal_id = random.choice(won_deal_ids)
            deal = deals[deal_id - 1]
            customer_id = deal[0]
        else:
            deal_id = random.randint(1, 60)
            customer_id = random.randint(1, 25)
        product_id = random.randint(1, 15)
        product_price = PRODUCTS_DATA[product_id - 1][2]
        quantity = random.randint(1, 20)
        unit_price = round(product_price * random.uniform(0.85, 1.1), 2)
        total = round(quantity * unit_price, 2)
        order_date = random_date(date(2023, 6, 1), date(2024, 10, 31))
        status = random.choices(ORDER_STATUSES, weights=[15, 25, 50, 10])[0]
        orders.append((customer_id, deal_id, product_id, quantity, unit_price, total, order_date, status))

    conn.executemany(
        "INSERT INTO orders (customer_id, deal_id, product_id, quantity, unit_price, total, order_date, status) VALUES (?,?,?,?,?,?,?,?)",
        orders,
    )

    # --- Activities (200) ---
    activities = []
    for i in range(200):
        customer_id = random.randint(1, 25)
        rep_id = random.randint(1, 8)
        deal_id = random.randint(1, 60) if random.random() > 0.3 else None
        act_type = random.choice(ACTIVITY_TYPES)
        templates = ACTIVITY_SUMMARIES[act_type]
        summary = random.choice(templates).format(
            q=random.randint(1, 4),
            industry=COMPANIES[customer_id - 1][2],
        )
        act_date = random_date(date(2023, 1, 1), date(2024, 10, 31))
        activities.append((customer_id, rep_id, deal_id, act_type, summary, act_date))

    conn.executemany(
        "INSERT INTO activities (customer_id, sales_rep_id, deal_id, type, summary, date) VALUES (?,?,?,?,?,?)",
        activities,
    )

    conn.commit()
    conn.close()

    print(f"Database created at: {DB_PATH}")
    print(f"  Customers: 25")
    print(f"  Sales Reps: 8")
    print(f"  Products: 15")
    print(f"  Deals: 60")
    print(f"  Orders: 120")
    print(f"  Activities: 200")


if __name__ == "__main__":
    seed()
