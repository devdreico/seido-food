require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");

const { CATALOG, SHIPPING_BY_ZONE } = require("./catalog");
const { createOrder, getOrderByReference, updateOrderStatus } = require("./db");

const app = express();
app.disable("x-powered-by");

const PORT = Number(process.env.PORT || 3000);
const ORDER_CURRENCY = process.env.ORDER_CURRENCY || "COP";
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`).trim();
const FORMSPREE_ENDPOINT = String(process.env.FORMSPREE_ENDPOINT || "https://formspree.io/f/xykdbqaz").trim();
const FORMSPREE_TIMEOUT_MS = Number(process.env.FORMSPREE_TIMEOUT_MS || 8000);
const GOOGLE_MAPS_SERVER_API_KEY = String(process.env.GOOGLE_MAPS_SERVER_API_KEY || "").trim();
const GEOCODER_USER_AGENT = String(process.env.GEOCODER_USER_AGENT || "seido-cash-ordering-app/1.0").trim();

const NEQUI_CHECKOUT_URL = String(process.env.NEQUI_CHECKOUT_URL || "").trim();
const CARD_CHECKOUT_URL = String(process.env.CARD_CHECKOUT_URL || "").trim();
const PAYPAL_CHECKOUT_URL = String(process.env.PAYPAL_CHECKOUT_URL || "").trim();
const GENERAL_CHECKOUT_URL = String(process.env.GENERAL_CHECKOUT_URL || "").trim();

const frontendRoot = path.resolve(__dirname, "..");
const DELIVERY_ZONES = parseDeliveryZones();
const COVERAGE_ENABLED = DELIVERY_ZONES.length > 0;
const PAYMENT_METHODS = ["cash", "nequi", "card", "paypal", "general"];

function parseDeliveryZones() {
    const raw = String(process.env.DELIVERY_ZONES_JSON || "").trim();

    if (!raw) {
        return [];
    }

    let parsed = null;

    try {
        parsed = JSON.parse(raw);
    } catch (_error) {
        console.warn("DELIVERY_ZONES_JSON could not be parsed. Coverage disabled.");
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed
        .map((zone, index) => {
            const id = String(zone && zone.id ? zone.id : `zone-${index + 1}`)
                .toLowerCase()
                .trim();

            const name = String(zone && zone.name ? zone.name : id).trim();
            const latitude = Number(zone && (zone.latitude ?? zone.lat ?? zone?.center?.latitude ?? zone?.center?.lat));
            const longitude = Number(zone && (zone.longitude ?? zone.lng ?? zone?.center?.longitude ?? zone?.center?.lng));
            const radiusKm = Number(zone && (zone.radiusKm ?? zone.radius_km));
            const shippingInCents = Number(zone && (zone.shippingInCents ?? zone.shipping ?? zone.shipping_in_cents));

            if (!id || !name) {
                return null;
            }

            if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
                return null;
            }

            if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
                return null;
            }

            return {
                id,
                name,
                center: { latitude, longitude },
                radiusKm,
                shippingInCents: Number.isFinite(shippingInCents)
                    ? shippingInCents
                    : (SHIPPING_BY_ZONE.auto || 0)
            };
        })
        .filter(Boolean);
}

function getCorsConfig() {
    const configured = (process.env.CORS_ORIGIN || "").trim();

    if (!configured) {
        return {};
    }

    if (configured === "*") {
        return { origin: true };
    }

    const allowlist = configured
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    return {
        origin(origin, callback) {
            if (!origin || allowlist.includes(origin)) {
                callback(null, true);
                return;
            }

            callback(new Error("Origin not allowed by CORS"));
        }
    };
}

app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            frameAncestors: ["'self'"],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'", "https://unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://nominatim.openstreetmap.org", "https://maps.googleapis.com", "https://formspree.io"],
            frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com", "https://www.google.com.co"]
        }
    }
}));

app.use(cors(getCorsConfig()));
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function hasFetchSupport() {
    return typeof fetch === "function";
}

function createReference() {
    return `SEIDO-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

function normalizeZone(zone) {
    const key = String(zone || "auto").toLowerCase().trim();
    return SHIPPING_BY_ZONE[key] ? key : "auto";
}

function normalizePaymentMethod(rawMethod) {
    const method = String(rawMethod || "cash").toLowerCase().trim();
    return PAYMENT_METHODS.includes(method) ? method : "cash";
}

function normalizeItems(rawItems) {
    if (!Array.isArray(rawItems)) {
        return [];
    }

    const items = [];

    rawItems.forEach((item) => {
        const id = String(item && item.id ? item.id : "").trim();
        const qty = Number(item && item.qty);

        if (!id || !Number.isFinite(qty) || qty <= 0) {
            return;
        }

        const product = CATALOG[id];
        if (!product) {
            return;
        }

        items.push({
            id,
            name: product.name,
            qty,
            unitPrice: product.price,
            totalPrice: product.price * qty
        });
    });

    return items;
}

function normalizeLocation(rawLocation) {
    if (!rawLocation || typeof rawLocation !== "object") {
        return null;
    }

    const latitude = Number(rawLocation.latitude ?? rawLocation.lat);
    const longitude = Number(rawLocation.longitude ?? rawLocation.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        return null;
    }

    return { latitude, longitude };
}

function isValidPhone(phone) {
    return /^[0-9+()\s-]{7,20}$/.test(String(phone || "").trim());
}

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function distanceKm(from, to) {
    const earthRadiusKm = 6371;
    const latDiff = toRadians(to.latitude - from.latitude);
    const lngDiff = toRadians(to.longitude - from.longitude);
    const latA = toRadians(from.latitude);
    const latB = toRadians(to.latitude);

    const value = (Math.sin(latDiff / 2) ** 2)
        + (Math.cos(latA) * Math.cos(latB) * (Math.sin(lngDiff / 2) ** 2));

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(value));
}

function findCoverageZone(location) {
    if (!location || !COVERAGE_ENABLED) {
        return null;
    }

    let best = null;

    DELIVERY_ZONES.forEach((zone) => {
        const km = distanceKm(location, zone.center);

        if (km > zone.radiusKm) {
            return;
        }

        if (!best || km < best.distanceKm) {
            best = {
                ...zone,
                distanceKm: km
            };
        }
    });

    return best;
}

function resolveShippingAndZone(input) {
    if (!COVERAGE_ENABLED) {
        const zone = normalizeZone(input.requestedZone);
        return {
            ok: true,
            zone,
            shippingInCents: SHIPPING_BY_ZONE[zone] || SHIPPING_BY_ZONE.auto || 0,
            coverageZone: null
        };
    }

    if (!input.location) {
        return {
            ok: false,
            statusCode: 400,
            error: "location is required to validate delivery coverage"
        };
    }

    const coverageZone = findCoverageZone(input.location);

    if (!coverageZone) {
        return {
            ok: false,
            statusCode: 400,
            error: "Address is outside the configured delivery coverage"
        };
    }

    return {
        ok: true,
        zone: coverageZone.id,
        shippingInCents: coverageZone.shippingInCents,
        coverageZone
    };
}

function calculateTotals(items, shippingInCents) {
    const subtotalInCents = items.reduce((acc, item) => acc + item.totalPrice, 0);
    const totalInCents = subtotalInCents + shippingInCents;

    return {
        subtotalInCents,
        shippingInCents,
        totalInCents
    };
}

function serializeOrder(order) {
    const noteMeta = parseOrderNotes(order.notes);

    return {
        id: order.id,
        reference: order.reference,
        status: order.status,
        currency: order.currency,
        subtotalInCents: order.subtotal_in_cents,
        shippingInCents: order.shipping_in_cents,
        totalInCents: order.total_in_cents,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        customerAddress: order.customer_address,
        customerReference: order.customer_reference,
        customerNeighborhood: String(noteMeta.customerNeighborhood || order.customer_reference || "").trim(),
        zone: order.zone,
        paymentMethod: order.payment_method,
        notes: order.notes,
        locationMode: String(noteMeta.locationMode || "manual"),
        locationLabel: String(noteMeta.locationLabel || order.customer_address || "").trim(),
        resolvedAddress: String(noteMeta.resolvedAddress || "").trim(),
        items: order.items,
        location: order.location,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        paidAt: order.paid_at
    };
}

function normalizeGeocodedCoords(latitude, longitude) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return null;
    }

    return { latitude: lat, longitude: lng };
}

async function geocodeByGoogleAddress(address) {
    if (!GOOGLE_MAPS_SERVER_API_KEY || !hasFetchSupport()) {
        return null;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("address", address);
    url.searchParams.set("key", GOOGLE_MAPS_SERVER_API_KEY);
    url.searchParams.set("region", "CO");

    const response = await fetch(url.toString());
    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
        return null;
    }

    const first = data.results[0];
    const location = first && first.geometry ? first.geometry.location : null;
    const coords = normalizeGeocodedCoords(location ? location.lat : null, location ? location.lng : null);

    if (!coords) {
        return null;
    }

    return {
        address: String(first.formatted_address || address).trim(),
        coords,
        provider: "google"
    };
}

async function reverseGeocodeByGoogle(latitude, longitude) {
    if (!GOOGLE_MAPS_SERVER_API_KEY || !hasFetchSupport()) {
        return null;
    }

    const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
    url.searchParams.set("latlng", `${latitude},${longitude}`);
    url.searchParams.set("key", GOOGLE_MAPS_SERVER_API_KEY);
    url.searchParams.set("region", "CO");

    const response = await fetch(url.toString());
    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => null);
    if (!data || data.status !== "OK" || !Array.isArray(data.results) || data.results.length === 0) {
        return null;
    }

    const formattedAddress = String(data.results[0].formatted_address || "").trim();
    if (!formattedAddress) {
        return null;
    }

    return {
        address: formattedAddress,
        coords: { latitude, longitude },
        provider: "google"
    };
}

async function geocodeByNominatimAddress(address) {
    if (!hasFetchSupport()) {
        return null;
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("q", address);

    const response = await fetch(url.toString(), {
        headers: {
            "User-Agent": GEOCODER_USER_AGENT,
            "Accept-Language": "es"
        }
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => null);

    if (!Array.isArray(data) || data.length === 0) {
        return null;
    }

    const first = data[0];
    const coords = normalizeGeocodedCoords(first ? first.lat : null, first ? first.lon : null);

    if (!coords) {
        return null;
    }

    return {
        address: String(first.display_name || address).trim(),
        coords,
        provider: "nominatim"
    };
}

async function reverseGeocodeByNominatim(latitude, longitude) {
    if (!hasFetchSupport()) {
        return null;
    }

    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const response = await fetch(url.toString(), {
        headers: {
            "User-Agent": GEOCODER_USER_AGENT,
            "Accept-Language": "es"
        }
    });

    if (!response.ok) {
        return null;
    }

    const data = await response.json().catch(() => null);
    const formattedAddress = String(data && data.display_name ? data.display_name : "").trim();

    if (!formattedAddress) {
        return null;
    }

    return {
        address: formattedAddress,
        coords: { latitude, longitude },
        provider: "nominatim"
    };
}

async function geocodeAddress(address) {
    const normalized = String(address || "").trim();
    if (!normalized) {
        return null;
    }

    const google = await geocodeByGoogleAddress(normalized);
    if (google) {
        return google;
    }

    return geocodeByNominatimAddress(normalized);
}

async function reverseGeocode(latitude, longitude) {
    const coords = normalizeGeocodedCoords(latitude, longitude);
    if (!coords) {
        return null;
    }

    const google = await reverseGeocodeByGoogle(coords.latitude, coords.longitude);
    if (google) {
        return google;
    }

    return reverseGeocodeByNominatim(coords.latitude, coords.longitude);
}

function parseOrderNotes(rawNotes) {
    const clean = String(rawNotes || "").trim();

    if (!clean) {
        return {};
    }

    try {
        const parsed = JSON.parse(clean);

        if (!parsed || typeof parsed !== "object") {
            return {};
        }

        return parsed;
    } catch (_error) {
        return {
            messageText: clean
        };
    }
}

function buildFormspreePayload(order) {
    const items = Array.isArray(order.items) ? order.items : [];
    const noteMeta = parseOrderNotes(order.notes);
    const lines = [];

    lines.push("NUEVO PEDIDO SEIDO");
    lines.push(`Referencia: ${order.reference}`);
    lines.push(`Estado: ${order.status}`);
    lines.push(`Fecha: ${order.createdAt}`);
    lines.push(`Cliente: ${order.customerName}`);
    lines.push(`Telefono: ${order.customerPhone}`);
    lines.push(`Barrio: ${noteMeta.customerNeighborhood || order.customerNeighborhood || order.customerReference || "No indicado"}`);
    lines.push(`Direccion visible: ${noteMeta.locationLabel || order.customerAddress || "No indicada"}`);
    lines.push(`Modo ubicacion: ${noteMeta.locationMode === "auto" ? "Ubicacion automatica" : "Manual"}`);
    lines.push(`Zona: ${order.zone || "auto"}`);
    lines.push(`Metodo de pago: ${order.paymentMethod}`);
    lines.push("");
    lines.push("Detalle de productos:");

    if (items.length === 0) {
        lines.push("- Sin items");
    } else {
        items.forEach((item) => {
            lines.push(`- ${item.name || item.id} x${item.qty} = ${item.totalPrice}`);
        });
    }

    lines.push("");
    lines.push(`Subtotal: ${order.subtotalInCents}`);
    lines.push(`Envio: ${order.shippingInCents}`);
    lines.push(`Total: ${order.totalInCents}`);
    lines.push(`Coordenadas internas: ${order.location ? `${order.location.latitude}, ${order.location.longitude}` : "No registradas"}`);

    if (noteMeta.resolvedAddress) {
        lines.push(`Direccion geocodificada interna: ${noteMeta.resolvedAddress}`);
    }

    if (noteMeta.messageText) {
        lines.push("");
        lines.push("Mensaje consolidado enviado desde el formulario:");
        lines.push(String(noteMeta.messageText));
    }

    return {
        _subject: `Nueva orden SEIDO ${order.reference}`,
        message: lines.join("\n")
    };
}

async function sendInvoiceToFormspree(order) {
    if (!FORMSPREE_ENDPOINT || !hasFetchSupport()) {
        return {
            sent: false,
            message: "Formspree no disponible en este entorno"
        };
    }

    const payload = buildFormspreePayload(order);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORMSPREE_TIMEOUT_MS);

    try {
        const response = await fetch(FORMSPREE_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) {
            return {
                sent: false,
                message: `Formspree respondio ${response.status}`
            };
        }

        return {
            sent: true,
            message: "Factura enviada a Formspree"
        };
    } catch (_error) {
        return {
            sent: false,
            message: "No fue posible enviar la factura a Formspree"
        };
    } finally {
        clearTimeout(timeout);
    }
}

function getExternalCheckoutUrl(method) {
    switch (method) {
        case "nequi":
            return NEQUI_CHECKOUT_URL || null;
        case "card":
            return CARD_CHECKOUT_URL || null;
        case "paypal":
            return PAYPAL_CHECKOUT_URL || null;
        case "general":
            return GENERAL_CHECKOUT_URL || null;
        default:
            return null;
    }
}

function buildGatewayUrl(input) {
    const gatewayUrl = new URL("/pasarela.html", APP_BASE_URL);
    gatewayUrl.searchParams.set("reference", input.reference);
    gatewayUrl.searchParams.set("method", input.method);

    if (input.externalUrl) {
        gatewayUrl.searchParams.set("external", input.externalUrl);
    }

    return `${gatewayUrl.pathname}${gatewayUrl.search}`;
}

async function parseAndValidateOrderPayload(payload) {
    const customer = payload && payload.customer ? payload.customer : {};

    const customerName = String(customer.name || "").trim();
    const customerPhone = String(customer.phone || "").trim();
    const customerNeighborhood = String(customer.neighborhood || "").trim();
    const customerAddress = String(customer.address || "").trim();
    const requestedZone = String(customer.zone || payload.zone || "auto").trim();
    const paymentMethod = normalizePaymentMethod(payload.paymentMethod || "cash");

    if (!customerName || !customerPhone || !customerAddress || !customerNeighborhood) {
        return {
            ok: false,
            statusCode: 400,
            error: "customer.name, customer.phone, customer.neighborhood and customer.address are required"
        };
    }

    if (!isValidPhone(customerPhone)) {
        return {
            ok: false,
            statusCode: 400,
            error: "customer.phone format is invalid"
        };
    }

    const items = normalizeItems(payload.items);

    if (items.length === 0) {
        return {
            ok: false,
            statusCode: 400,
            error: "At least one valid order item is required"
        };
    }

    let location = normalizeLocation(payload.location);

    if (!location && COVERAGE_ENABLED) {
        const geocoded = await geocodeAddress(customerAddress);
        location = geocoded ? geocoded.coords : null;
    }

    const shipping = resolveShippingAndZone({
        location,
        requestedZone
    });

    if (!shipping.ok) {
        return shipping;
    }

    const totals = calculateTotals(items, shipping.shippingInCents);

    return {
        ok: true,
        customerName,
        customerPhone,
        customerNeighborhood,
        customerAddress,
        zone: shipping.zone,
        location,
        items,
        totals,
        paymentMethod
    };
}

app.get("/api/health", (_req, res) => {
    res.json({
        ok: true,
        service: "seido-cash-backend",
        formspreeConfigured: Boolean(FORMSPREE_ENDPOINT)
    });
});

app.get("/api/checkout-config", (_req, res) => {
    res.json({
        currency: ORDER_CURRENCY,
        defaultShippingInCents: SHIPPING_BY_ZONE.auto || 0,
        coverageEnabled: COVERAGE_ENABLED,
        coverageZones: DELIVERY_ZONES.map((zone) => ({
            id: zone.id,
            name: zone.name,
            radiusKm: zone.radiusKm,
            shippingInCents: zone.shippingInCents,
            center: zone.center
        })),
        paymentMethods: [
            { id: "cash", label: "Efectivo", external: false },
            { id: "nequi", label: "Nequi", external: true, externalConfigured: Boolean(NEQUI_CHECKOUT_URL) },
            { id: "card", label: "Tarjeta", external: true, externalConfigured: Boolean(CARD_CHECKOUT_URL) },
            { id: "paypal", label: "PayPal", external: true, externalConfigured: Boolean(PAYPAL_CHECKOUT_URL) },
            { id: "general", label: "Pasarela general", external: true, externalConfigured: Boolean(GENERAL_CHECKOUT_URL) }
        ]
    });
});

app.get("/api/reverse-geocode", async (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);

    const coords = normalizeGeocodedCoords(latitude, longitude);

    if (!coords) {
        res.status(400).json({ error: "lat and lng are required" });
        return;
    }

    try {
        const result = await reverseGeocode(coords.latitude, coords.longitude);

        if (!result) {
            res.status(404).json({ error: "Address not found for coordinates" });
            return;
        }

        res.json({
            address: result.address,
            location: result.coords,
            provider: result.provider
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Reverse geocoding failed" });
    }
});

app.get("/api/geocode", async (req, res) => {
    const address = String(req.query.address || "").trim();

    if (!address) {
        res.status(400).json({ error: "address is required" });
        return;
    }

    try {
        const result = await geocodeAddress(address);

        if (!result) {
            res.status(404).json({ error: "Address not found" });
            return;
        }

        res.json({
            address: result.address,
            location: result.coords,
            provider: result.provider
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Geocoding failed" });
    }
});

async function createOrderHandler(req, res) {
    const parsed = await parseAndValidateOrderPayload(req.body || {});

    if (!parsed.ok) {
        res.status(parsed.statusCode || 400).json({
            error: parsed.error || "Invalid payload"
        });
        return;
    }

    const reference = createReference();
    const paymentMethod = parsed.paymentMethod;
    const locationModeRaw = String(req.body?.locationMeta?.mode || "manual").toLowerCase().trim();
    const locationMode = locationModeRaw === "auto" ? "auto" : "manual";
    const locationLabel = String(req.body?.locationMeta?.label || parsed.customerAddress || "").trim();
    const resolvedAddress = String(req.body?.locationMeta?.resolvedAddress || "").trim();
    const messageText = String(req.body?.notes || "").trim();

    const notesPayload = JSON.stringify({
        customerNeighborhood: parsed.customerNeighborhood,
        locationMode,
        locationLabel: locationLabel || parsed.customerAddress,
        resolvedAddress,
        messageText
    });

    const order = createOrder({
        reference,
        status: paymentMethod === "cash" ? "pending_cash" : "pending_payment",
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
        customerAddress: parsed.customerAddress,
        customerReference: parsed.customerNeighborhood,
        zone: parsed.zone,
        paymentMethod,
        notes: notesPayload,
        currency: ORDER_CURRENCY,
        subtotalInCents: parsed.totals.subtotalInCents,
        shippingInCents: parsed.totals.shippingInCents,
        totalInCents: parsed.totals.totalInCents,
        items: parsed.items,
        location: parsed.location
    });

    const serializedOrder = serializeOrder(order);

    if (paymentMethod === "cash") {
        const invoiceResult = await sendInvoiceToFormspree(serializedOrder);

        res.status(201).json({
            ...serializedOrder,
            invoiceSent: invoiceResult.sent,
            invoiceMessage: invoiceResult.message,
            nextUrl: ""
        });
        return;
    }

    const externalUrl = getExternalCheckoutUrl(paymentMethod);
    const gatewayUrl = buildGatewayUrl({
        reference,
        method: paymentMethod,
        externalUrl
    });

    res.status(201).json({
        ...serializedOrder,
        invoiceSent: false,
        invoiceMessage: "Factura pendiente hasta confirmacion del pago.",
        externalCheckoutUrl: externalUrl,
        nextUrl: gatewayUrl
    });
}

async function paymentResultHandler(req, res) {
    const reference = String(req.params.reference || "").trim();
    const result = String(req.body?.result || req.body?.status || "").toLowerCase().trim();

    if (!reference) {
        res.status(400).json({ error: "reference is required" });
        return;
    }

    const order = getOrderByReference(reference);
    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }

    if (!["success", "failed", "paid", "error", "cancelled"].includes(result)) {
        res.status(400).json({ error: "result must be success, paid, failed, error or cancelled" });
        return;
    }

    const success = result === "success" || result === "paid";

    const updated = updateOrderStatus({
        reference,
        status: success ? "paid" : "payment_failed"
    });

    if (!updated) {
        res.status(500).json({ error: "Could not update payment status" });
        return;
    }

    const serializedOrder = serializeOrder(updated);

    if (!success) {
        res.json({
            ...serializedOrder,
            invoiceSent: false,
            invoiceMessage: "Factura no enviada por pago fallido.",
            nextUrl: `/pago-error.html?reference=${encodeURIComponent(reference)}`
        });
        return;
    }

    const invoiceResult = await sendInvoiceToFormspree(serializedOrder);

    res.json({
        ...serializedOrder,
        invoiceSent: invoiceResult.sent,
        invoiceMessage: invoiceResult.message,
        nextUrl: `/gracias.html?reference=${encodeURIComponent(reference)}`
    });
}

app.post("/create-order", createOrderHandler);
app.post("/api/create-order", createOrderHandler);

app.post("/api/orders/:reference/payment-result", paymentResultHandler);

app.get("/api/orders/:reference", (req, res) => {
    const order = getOrderByReference(req.params.reference);

    if (!order) {
        res.status(404).json({ error: "Order not found" });
        return;
    }

    res.json(serializeOrder(order));
});

app.use(express.static(frontendRoot, {
    etag: true,
    maxAge: "7d",
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === ".html") {
            res.setHeader("Cache-Control", "no-cache, max-age=0");
            return;
        }

        if ([".png", ".jpg", ".jpeg", ".webp", ".avif", ".svg", ".ico"].includes(ext)) {
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            return;
        }

        if ([".css", ".js"].includes(ext)) {
            res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
            return;
        }

        res.setHeader("Cache-Control", "public, max-age=86400");
    }
}));

app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
        next();
        return;
    }

    res.sendFile(path.join(frontendRoot, "index.html"));
});

app.use((error, _req, res, _next) => {
    console.error(error);
    if (error && (error.type === "entity.parse.failed" || error.status === 400)) {
        res.status(400).json({ error: "Invalid JSON payload" });
        return;
    }

    res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
    console.log(`SEIDO backend running on http://localhost:${PORT}`);
    if (COVERAGE_ENABLED) {
        console.log(`Delivery coverage enabled with ${DELIVERY_ZONES.length} zone(s).`);
    }
});
