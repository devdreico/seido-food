const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function resolveDbPath() {
    const configured = process.env.DB_FILE;

    if (!configured) {
        return path.join(__dirname, "data", "orders.sqlite");
    }

    return path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured);
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

function nowIso() {
    return new Date().toISOString();
}

function setupSchema() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference TEXT NOT NULL UNIQUE,
            status TEXT NOT NULL,
            customer_name TEXT,
            customer_phone TEXT,
            customer_address TEXT,
            customer_reference TEXT,
            zone TEXT,
            payment_method TEXT,
            notes TEXT,
            currency TEXT NOT NULL,
            subtotal_in_cents INTEGER NOT NULL,
            shipping_in_cents INTEGER NOT NULL,
            total_in_cents INTEGER NOT NULL,
            items_json TEXT NOT NULL,
            location_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            paid_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(reference);
    `);
}

setupSchema();

function mapOrderRow(row) {
    if (!row) {
        return null;
    }

    return {
        ...row,
        items: JSON.parse(row.items_json || "[]"),
        location: row.location_json ? JSON.parse(row.location_json) : null
    };
}

function createOrder(input) {
    const timestamp = nowIso();

    const insert = db.prepare(`
        INSERT INTO orders (
            reference,
            status,
            customer_name,
            customer_phone,
            customer_address,
            customer_reference,
            zone,
            payment_method,
            notes,
            currency,
            subtotal_in_cents,
            shipping_in_cents,
            total_in_cents,
            items_json,
            location_json,
            created_at,
            updated_at
        ) VALUES (
            @reference,
            @status,
            @customer_name,
            @customer_phone,
            @customer_address,
            @customer_reference,
            @zone,
            @payment_method,
            @notes,
            @currency,
            @subtotal_in_cents,
            @shipping_in_cents,
            @total_in_cents,
            @items_json,
            @location_json,
            @created_at,
            @updated_at
        )
    `);

    insert.run({
        reference: input.reference,
        status: input.status,
        customer_name: input.customerName || null,
        customer_phone: input.customerPhone || null,
        customer_address: input.customerAddress || null,
        customer_reference: input.customerReference || null,
        zone: input.zone || null,
        payment_method: input.paymentMethod || null,
        notes: input.notes || null,
        currency: input.currency,
        subtotal_in_cents: input.subtotalInCents,
        shipping_in_cents: input.shippingInCents,
        total_in_cents: input.totalInCents,
        items_json: JSON.stringify(input.items || []),
        location_json: input.location ? JSON.stringify(input.location) : null,
        created_at: timestamp,
        updated_at: timestamp
    });

    return getOrderByReference(input.reference);
}

function getOrderByReference(reference) {
    const row = db.prepare("SELECT * FROM orders WHERE reference = ?").get(reference);
    return mapOrderRow(row);
}

function updateOrderStatus(input) {
    const reference = String(input && input.reference ? input.reference : "").trim();
    if (!reference) {
        return null;
    }

    const status = String(input && input.status ? input.status : "").trim();
    if (!status) {
        return null;
    }

    const current = getOrderByReference(reference);
    if (!current) {
        return null;
    }

    const updatedAt = nowIso();

    db.prepare(`
        UPDATE orders
        SET
            status = @status,
            payment_method = COALESCE(@payment_method, payment_method),
            updated_at = @updated_at,
            paid_at = CASE
                WHEN @status = 'paid' THEN COALESCE(paid_at, @updated_at)
                ELSE paid_at
            END
        WHERE reference = @reference
    `).run({
        reference,
        status,
        payment_method: input && input.paymentMethod ? String(input.paymentMethod).trim() : null,
        updated_at: updatedAt
    });

    return getOrderByReference(reference);
}

module.exports = {
    db,
    createOrder,
    getOrderByReference,
    updateOrderStatus
};
