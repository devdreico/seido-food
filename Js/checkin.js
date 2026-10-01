(function () {
    const store = window.SeidoStore;

    if (!store) {
        return;
    }

    const SEIDO_CONFIG = {
        backendBaseUrl: "",
        ...(window.SEIDO_CONFIG || {})
    };

    const API_BASE = String(SEIDO_CONFIG.backendBaseUrl || "").replace(/\/$/, "");

    const checkinForm = document.getElementById("checkinForm");
    const customerName = document.getElementById("customerName");
    const customerPhone = document.getElementById("customerPhone");
    const customerNeighborhood = document.getElementById("customerNeighborhood");
    const addressInput = document.getElementById("addressInput");
    const autoLocateBtn = document.getElementById("autoLocateBtn");
    const autoLocationState = document.getElementById("autoLocationState");
    const payBtn = document.getElementById("payBtn");
    const checkinStatus = document.getElementById("checkinStatus");
    const checkinProgress = document.getElementById("checkinProgress");
    const checkinProgressText = document.getElementById("checkinProgressText");
    const checkinProgressFill = document.getElementById("checkinProgressFill");
    const orderList = document.getElementById("orderList");
    const subtotalValue = document.getElementById("subtotalValue");
    const shippingValue = document.getElementById("shippingValue");
    const totalValue = document.getElementById("totalValue");
    const paymentOptions = document.getElementById("paymentOptions");
    const paymentHint = document.getElementById("paymentHint");
    const deliveryMessagePreview = document.getElementById("deliveryMessagePreview");
    const deliveryMessageHint = document.getElementById("deliveryMessageHint");

    const customerNameFeedback = document.getElementById("customerNameFeedback");
    const customerPhoneFeedback = document.getElementById("customerPhoneFeedback");
    const customerNeighborhoodFeedback = document.getElementById("customerNeighborhoodFeedback");
    const addressFeedback = document.getElementById("addressFeedback");

    if (!checkinForm || !customerName || !customerPhone || !customerNeighborhood || !addressInput || !autoLocateBtn || !autoLocationState || !payBtn || !deliveryMessagePreview) {
        return;
    }

    const DRAFT_KEY = "seido_checkin_draft_v1";

    const PAYMENT_HINTS = {
        cash: "Efectivo: confirmacion inmediata y envio de mensaje unico a Formspree.",
        nequi: "Nequi: redireccion a pasarela Nequi y luego confirmacion del resultado.",
        card: "Tarjeta: redireccion a pasarela de tarjeta y confirmacion del resultado.",
        paypal: "PayPal: redireccion al checkout de PayPal y confirmacion del resultado.",
        general: "Pasarela general: redireccion a checkout externo flexible."
    };

    const PAYMENT_LABELS = {
        cash: "Efectivo",
        nequi: "Nequi",
        card: "Tarjeta",
        paypal: "PayPal",
        general: "Pasarela general"
    };

    const fieldDefaults = {
        customerName: customerNameFeedback ? customerNameFeedback.textContent : "",
        customerPhone: customerPhoneFeedback ? customerPhoneFeedback.textContent : "",
        customerNeighborhood: customerNeighborhoodFeedback ? customerNeighborhoodFeedback.textContent : "",
        addressInput: addressFeedback ? addressFeedback.textContent : ""
    };

    const state = {
        selectedCoords: null,
        selectedZone: null,
        selectedPaymentMethod: "cash",
        autoLocationEnabled: false,
        autoResolvedAddress: "",
        checkoutConfig: {
            coverageEnabled: false,
            coverageZones: [],
            defaultShippingInCents: 5000,
            currency: "COP"
        },
        availablePaymentMethods: ["cash", "nequi", "card", "paypal", "general"],
        paymentMethodConfig: {},
        isSubmitting: false,
        touchedFields: {
            customerName: false,
            customerPhone: false,
            customerNeighborhood: false,
            addressInput: false
        }
    };

    function apiUrl(path) {
        return `${API_BASE}${path}`;
    }

    function sleep(ms) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, ms);
        });
    }

    function ensureVisible(node) {
        if (!node || typeof node.getBoundingClientRect !== "function") {
            return;
        }

        const rect = node.getBoundingClientRect();
        const outOfView = rect.top < 0 || rect.bottom > window.innerHeight;

        if (!outOfView) {
            return;
        }

        node.scrollIntoView({
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
            block: "nearest"
        });
    }

    function setStatus(message, type, options = {}) {
        checkinStatus.textContent = message || "";
        checkinStatus.className = "status";

        if (type === "ok") {
            checkinStatus.classList.add("ok");
        }

        if (type === "error") {
            checkinStatus.classList.add("error");
        }

        if (options.confirmed) {
            checkinStatus.classList.add("is-confirmed");
        }

        if (options.highlight !== false && message) {
            checkinStatus.classList.add("is-highlight");
        }

        if (type === "error" && options.scroll !== false) {
            ensureVisible(checkinStatus);
        }
    }

    function setLoading(active, text) {
        if (!payBtn.dataset.defaultText) {
            payBtn.dataset.defaultText = payBtn.textContent;
        }

        payBtn.disabled = active;
        payBtn.classList.toggle("is-loading", active);
        payBtn.setAttribute("aria-busy", active ? "true" : "false");
        payBtn.textContent = active ? (text || "Procesando...") : payBtn.dataset.defaultText;
    }

    function toNumber(value, fallback = 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeCoords(raw) {
        if (!raw || typeof raw !== "object") {
            return null;
        }

        const latitude = toNumber(raw.latitude);
        const longitude = toNumber(raw.longitude);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
        }

        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            return null;
        }

        return { latitude, longitude };
    }

    function toRadians(value) {
        return (value * Math.PI) / 180;
    }

    function distanceKm(from, to) {
        const earthRadius = 6371;
        const latDiff = toRadians(to.latitude - from.latitude);
        const lngDiff = toRadians(to.longitude - from.longitude);
        const latA = toRadians(from.latitude);
        const latB = toRadians(to.latitude);

        const value = (Math.sin(latDiff / 2) ** 2)
            + (Math.cos(latA) * Math.cos(latB) * (Math.sin(lngDiff / 2) ** 2));

        return 2 * earthRadius * Math.asin(Math.sqrt(value));
    }

    function getShipping() {
        if (state.selectedZone && Number.isFinite(state.selectedZone.shippingInCents)) {
            return state.selectedZone.shippingInCents;
        }

        return state.checkoutConfig.defaultShippingInCents;
    }

    function setAutoLocationHint(message, isError = false) {
        autoLocationState.textContent = message || "";
        autoLocationState.classList.remove("is-error", "is-ok");
        autoLocationState.classList.add(isError ? "is-error" : "is-ok");
    }

    function getPaymentLabel(method) {
        return PAYMENT_LABELS[method] || "Metodo no definido";
    }

    function saveDraft() {
        const payload = {
            customerName: customerName.value.trim(),
            customerPhone: customerPhone.value.trim(),
            customerNeighborhood: customerNeighborhood.value.trim(),
            addressInput: state.autoLocationEnabled ? "" : addressInput.value.trim(),
            paymentMethod: state.selectedPaymentMethod || "cash",
            updatedAt: Date.now()
        };

        const hasAnyData = Boolean(payload.customerName || payload.customerPhone || payload.customerNeighborhood || payload.addressInput || payload.paymentMethod !== "cash");

        try {
            if (!hasAnyData) {
                localStorage.removeItem(DRAFT_KEY);
                return;
            }

            localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
        } catch (_error) {
            // Ignore persistence errors to keep checkout flow uninterrupted.
        }
    }

    function clearDraft() {
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch (_error) {
            // Ignore localStorage failures.
        }
    }

    function restoreDraft() {
        let draft = null;

        try {
            draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
        } catch (_error) {
            draft = null;
        }

        if (!draft || typeof draft !== "object") {
            return false;
        }

        const draftName = String(draft.customerName || "").trim();
        const draftPhone = String(draft.customerPhone || "").trim();
        const draftNeighborhood = String(draft.customerNeighborhood || "").trim();
        const draftAddress = String(draft.addressInput || "").trim();
        const draftPayment = String(draft.paymentMethod || "").toLowerCase().trim();

        if (draftName) {
            customerName.value = draftName;
        }

        if (draftPhone) {
            customerPhone.value = draftPhone;
        }

        if (draftNeighborhood) {
            customerNeighborhood.value = draftNeighborhood;
        }

        if (draftAddress) {
            addressInput.value = draftAddress;
        }

        if (draftPayment && state.availablePaymentMethods.includes(draftPayment)) {
            state.selectedPaymentMethod = draftPayment;
        }

        return Boolean(draftName || draftPhone || draftNeighborhood || draftAddress || draftPayment);
    }

    function getCompletionProgress() {
        const checks = [
            customerName.value.trim().length >= 3,
            isValidPhone(customerPhone.value.trim()),
            customerNeighborhood.value.trim().length >= 2,
            (state.autoLocationEnabled && Boolean(state.selectedCoords)) || addressInput.value.trim().length >= 8,
            Boolean(state.selectedPaymentMethod)
        ];

        const total = checks.length;
        const completed = checks.filter(Boolean).length;
        const percent = Math.round((completed / total) * 100);

        return { completed, total, percent };
    }

    function renderProgress() {
        if (!checkinProgress || !checkinProgressText || !checkinProgressFill) {
            return;
        }

        const snapshot = getCompletionProgress();
        checkinProgressFill.style.width = `${snapshot.percent}%`;
        checkinProgressText.textContent = snapshot.completed >= snapshot.total
            ? "Formulario listo para enviar."
            : `Completa ${snapshot.completed}/${snapshot.total} pasos para enviar.`;
        checkinProgress.classList.toggle("is-complete", snapshot.completed >= snapshot.total);
        payBtn.classList.toggle("is-ready", snapshot.completed >= snapshot.total);
    }

    function renderTotals() {
        const subtotal = store.getSubtotal();
        const shipping = getShipping();
        const total = subtotal + shipping;

        subtotalValue.textContent = store.formatCop(subtotal);
        shippingValue.textContent = store.formatCop(shipping);
        totalValue.textContent = store.formatCop(total);
        renderProgress();
    }

    function renderOrderList() {
        const lines = store.getCartLines();

        if (lines.length === 0) {
            window.location.assign("catalogo.html?reason=empty");
            return false;
        }

        orderList.innerHTML = lines
            .map((line) => `
                <li>
                    <span>${line.name} x${line.qty}</span>
                    <strong>${store.formatCop(line.totalPrice)}</strong>
                </li>
            `)
            .join("");

        return true;
    }

    function buildPreviewMessage(includeInternalCoordinates) {
        const lines = [];
        const cartLines = store.getCartLines();
        const subtotal = store.getSubtotal();
        const shipping = getShipping();
        const total = subtotal + shipping;
        const addressLabel = state.autoLocationEnabled ? "Ubicacion automatica" : (addressInput.value.trim() || "-");
        const zoneLabel = state.checkoutConfig.coverageEnabled
            ? (state.selectedZone ? state.selectedZone.name : "Pendiente validar cobertura")
            : "No aplica";

        lines.push("PEDIDO SEIDO");
        lines.push(`Cliente: ${customerName.value.trim() || "-"}`);
        lines.push(`Telefono: ${customerPhone.value.trim() || "-"}`);
        lines.push(`Barrio: ${customerNeighborhood.value.trim() || "-"}`);
        lines.push(`Direccion: ${addressLabel}`);
        lines.push(`Metodo de pago: ${getPaymentLabel(state.selectedPaymentMethod)}`);
        lines.push(`Zona: ${zoneLabel}`);

        if (includeInternalCoordinates && state.selectedCoords) {
            lines.push(`Coordenadas internas: ${state.selectedCoords.latitude.toFixed(6)}, ${state.selectedCoords.longitude.toFixed(6)}`);
            if (state.autoResolvedAddress) {
                lines.push(`Direccion geocodificada interna: ${state.autoResolvedAddress}`);
            }
        }

        lines.push("");
        lines.push("Detalle del pedido:");

        if (cartLines.length === 0) {
            lines.push("- Sin productos");
        } else {
            cartLines.forEach((line) => {
                lines.push(`- ${line.name} x${line.qty}: ${store.formatCop(line.totalPrice)}`);
            });
        }

        lines.push("");
        lines.push(`Subtotal: ${store.formatCop(subtotal)}`);
        lines.push(`Envio: ${store.formatCop(shipping)}`);
        lines.push(`Total: ${store.formatCop(total)}`);

        return lines.join("\n");
    }

    function updateMessagePreview() {
        const message = buildPreviewMessage(false);
        deliveryMessagePreview.value = message;
        const rows = Math.max(11, Math.min(17, message.split("\n").length + 1));
        deliveryMessagePreview.rows = rows;
    }

    async function fetchJson(url) {
        const response = await fetch(url);

        if (!response.ok) {
            return null;
        }

        return response.json().catch(() => null);
    }

    async function reverseGeocodeCoords(latitude, longitude) {
        const query = new URLSearchParams({
            lat: String(latitude),
            lng: String(longitude)
        });

        const data = await fetchJson(`${apiUrl("/api/reverse-geocode")}?${query.toString()}`);

        if (!data || !data.address) {
            return null;
        }

        return {
            address: String(data.address).trim(),
            provider: String(data.provider || "backend")
        };
    }

    async function geocodeAddress(address) {
        const normalized = String(address || "").trim();

        if (!normalized) {
            return null;
        }

        const query = new URLSearchParams({ address: normalized });
        const data = await fetchJson(`${apiUrl("/api/geocode")}?${query.toString()}`);

        if (!data || !data.location) {
            return null;
        }

        const coords = normalizeCoords(data.location);

        if (!coords) {
            return null;
        }

        return {
            coords,
            address: String(data.address || normalized).trim()
        };
    }

    function findCoverageZone(coords) {
        if (!state.checkoutConfig.coverageEnabled || state.checkoutConfig.coverageZones.length === 0) {
            return null;
        }

        let bestMatch = null;

        state.checkoutConfig.coverageZones.forEach((zone) => {
            const dist = distanceKm(coords, zone.center);

            if (dist > zone.radiusKm) {
                return;
            }

            if (!bestMatch || dist < bestMatch.distanceKm) {
                bestMatch = {
                    ...zone,
                    distanceKm: dist
                };
            }
        });

        return bestMatch;
    }

    function setSelectedZone(coords, options = {}) {
        if (!state.checkoutConfig.coverageEnabled) {
            state.selectedZone = null;
            renderTotals();
            updateMessagePreview();
            return null;
        }

        const zone = findCoverageZone(coords);
        state.selectedZone = zone;
        renderTotals();
        updateMessagePreview();

        if (!options.silent) {
            if (zone) {
                setAutoLocationHint(`Cobertura valida en ${zone.name}. Envio ${store.formatCop(zone.shippingInCents)}.`);
            } else {
                setAutoLocationHint("La direccion registrada esta fuera de cobertura.", true);
            }
        }

        return zone;
    }

    function setFieldFeedback(fieldName, type, message) {
        const node = fieldName === "customerName"
            ? customerNameFeedback
            : fieldName === "customerPhone"
                ? customerPhoneFeedback
                : fieldName === "customerNeighborhood"
                    ? customerNeighborhoodFeedback
                    : addressFeedback;

        if (!node) {
            return;
        }

        node.textContent = message || fieldDefaults[fieldName] || "";
        node.classList.remove("is-error", "is-ok");

        if (type === "error") {
            node.classList.add("is-error");
        }

        if (type === "ok") {
            node.classList.add("is-ok");
        }
    }

    function setFieldState(input, stateName) {
        input.dataset.state = stateName;
        input.classList.toggle("is-valid", stateName === "valid");
        input.classList.toggle("is-invalid", stateName === "invalid");

        if (stateName === "invalid") {
            input.setAttribute("aria-invalid", "true");
        } else {
            input.removeAttribute("aria-invalid");
        }
    }

    function isValidPhone(phone) {
        return /^[0-9+()\s-]{7,20}$/.test(String(phone || "").trim());
    }

    function validateField(fieldName, options = {}) {
        const force = Boolean(options.force);

        const value = fieldName === "customerName"
            ? customerName.value.trim()
            : fieldName === "customerPhone"
                ? customerPhone.value.trim()
                : fieldName === "customerNeighborhood"
                    ? customerNeighborhood.value.trim()
                    : addressInput.value.trim();

        const input = fieldName === "customerName"
            ? customerName
            : fieldName === "customerPhone"
                ? customerPhone
                : fieldName === "customerNeighborhood"
                    ? customerNeighborhood
                    : addressInput;

        if (!value && !(fieldName === "addressInput" && state.autoLocationEnabled && state.selectedCoords)) {
            if (force || state.touchedFields[fieldName]) {
                setFieldState(input, "invalid");
                setFieldFeedback(fieldName, "error", "Este campo es obligatorio.");
                return { valid: false };
            }

            setFieldState(input, "pristine");
            setFieldFeedback(fieldName, "", fieldDefaults[fieldName]);
            return { valid: false };
        }

        if (fieldName === "customerName") {
            if (value.length < 3) {
                setFieldState(input, "invalid");
                setFieldFeedback(fieldName, "error", "Ingresa nombre y apellido.");
                return { valid: false };
            }

            setFieldState(input, "valid");
            setFieldFeedback(fieldName, "ok", "Nombre validado.");
            return { valid: true };
        }

        if (fieldName === "customerPhone") {
            if (!isValidPhone(value)) {
                setFieldState(input, "invalid");
                setFieldFeedback(fieldName, "error", "Telefono invalido. Usa 7 a 20 digitos.");
                return { valid: false };
            }

            setFieldState(input, "valid");
            setFieldFeedback(fieldName, "ok", "Telefono valido.");
            return { valid: true };
        }

        if (fieldName === "customerNeighborhood") {
            if (value.length < 2) {
                setFieldState(input, "invalid");
                setFieldFeedback(fieldName, "error", "Indica un barrio valido.");
                return { valid: false };
            }

            setFieldState(input, "valid");
            setFieldFeedback(fieldName, "ok", "Barrio validado.");
            return { valid: true };
        }

        if (state.autoLocationEnabled && state.selectedCoords) {
            setFieldState(input, "valid");
            setFieldFeedback(fieldName, "ok", "Ubicacion automatica activa.");
            return { valid: true };
        }

        if (value.length < 8) {
            setFieldState(input, "invalid");
            setFieldFeedback(fieldName, "error", "Agrega una direccion mas completa.");
            return { valid: false };
        }

        setFieldState(input, "valid");
        setFieldFeedback(fieldName, "ok", "Direccion validada.");
        return { valid: true };
    }

    async function loadCheckoutConfig() {
        const response = await fetchJson(apiUrl("/api/checkout-config"));

        if (!response) {
            return;
        }

        const zones = Array.isArray(response.coverageZones)
            ? response.coverageZones
                .map((zone) => {
                    const radiusKm = toNumber(zone.radiusKm);
                    const shippingInCents = toNumber(zone.shippingInCents);
                    const center = {
                        latitude: toNumber(zone?.center?.latitude),
                        longitude: toNumber(zone?.center?.longitude)
                    };

                    if (!zone.id || !zone.name || radiusKm <= 0) {
                        return null;
                    }

                    if (!Number.isFinite(center.latitude) || !Number.isFinite(center.longitude)) {
                        return null;
                    }

                    return {
                        id: String(zone.id),
                        name: String(zone.name),
                        radiusKm,
                        shippingInCents,
                        center
                    };
                })
                .filter(Boolean)
            : [];

        const configuredPaymentMethods = Array.isArray(response.paymentMethods)
            ? response.paymentMethods
                .map((method) => ({
                    id: String(method && method.id ? method.id : "").toLowerCase().trim(),
                    externalConfigured: Boolean(method && method.externalConfigured)
                }))
                .filter((method) => method.id)
            : [];

        state.checkoutConfig = {
            coverageEnabled: Boolean(response.coverageEnabled),
            coverageZones: zones,
            defaultShippingInCents: toNumber(response.defaultShippingInCents, 5000),
            currency: String(response.currency || "COP")
        };

        state.paymentMethodConfig = {};
        configuredPaymentMethods.forEach((method) => {
            state.paymentMethodConfig[method.id] = method;
        });

        state.availablePaymentMethods = configuredPaymentMethods.length > 0
            ? configuredPaymentMethods.map((method) => method.id)
            : ["cash", "nequi", "card", "paypal", "general"];

        document.querySelectorAll(".payment-option").forEach((button) => {
            const methodId = String(button.getAttribute("data-payment") || "").toLowerCase().trim();
            button.hidden = !state.availablePaymentMethods.includes(methodId);
        });

        if (state.checkoutConfig.coverageEnabled) {
            setAutoLocationHint("Cobertura activa. Validaremos la zona antes de enviar.");
        }

        renderTotals();
        updateMessagePreview();
    }

    function getPaymentHint(method) {
        const fallback = PAYMENT_HINTS[method] || "Selecciona metodo de pago.";
        const config = state.paymentMethodConfig[method];

        if (!config || method === "cash") {
            return fallback;
        }

        if (config.externalConfigured) {
            return fallback;
        }

        return `${fallback} (Sin URL externa configurada; se usara validacion manual).`;
    }

    function setPaymentMethod(method) {
        if (!state.availablePaymentMethods.includes(method)) {
            return;
        }

        state.selectedPaymentMethod = method;

        document.querySelectorAll(".payment-option").forEach((button) => {
            const active = button.getAttribute("data-payment") === method;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-checked", active ? "true" : "false");
        });

        paymentHint.textContent = getPaymentHint(method);
        updateMessagePreview();
        renderProgress();
        saveDraft();
    }

    function disableAutoLocation() {
        state.autoLocationEnabled = false;
        state.autoResolvedAddress = "";
        state.selectedCoords = null;
        state.selectedZone = null;

        addressInput.readOnly = false;
        addressInput.dataset.auto = "false";

        if (String(addressInput.value || "").trim().toLowerCase() === "ubicacion automatica") {
            addressInput.value = "";
        }

        autoLocateBtn.classList.remove("is-active");
        setAutoLocationHint("Ubicacion manual activa.");

        renderTotals();
        validateField("addressInput", { force: state.touchedFields.addressInput });
        updateMessagePreview();
        renderProgress();
        saveDraft();
    }

    async function enableAutoLocation() {
        if (!navigator.geolocation) {
            setAutoLocationHint("Tu navegador no soporta geolocalizacion.", true);
            return;
        }

        autoLocateBtn.disabled = true;
        autoLocateBtn.classList.add("is-loading");
        setAutoLocationHint("Detectando ubicacion automatica...");

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 10000
                });
            });

            const normalized = normalizeCoords({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            });

            if (!normalized) {
                throw new Error("No pudimos validar la coordenada detectada.");
            }

            state.selectedCoords = normalized;
            state.autoLocationEnabled = true;
            state.touchedFields.addressInput = true;

            const resolved = await reverseGeocodeCoords(normalized.latitude, normalized.longitude);
            state.autoResolvedAddress = resolved && resolved.address ? resolved.address : "";

            addressInput.value = "Ubicacion automatica";
            addressInput.readOnly = true;
            addressInput.dataset.auto = "true";
            autoLocateBtn.classList.add("is-active");

            validateField("addressInput", { force: true });

            if (state.checkoutConfig.coverageEnabled) {
                const zone = setSelectedZone(normalized, { silent: true });

                if (zone) {
                    setAutoLocationHint(`Ubicacion automatica activa. Cobertura valida en ${zone.name}.`);
                } else {
                    setAutoLocationHint("Ubicacion automatica activa, pero fuera de zona de cobertura.", true);
                }
            } else {
                setAutoLocationHint("Ubicacion automatica activa.");
                renderTotals();
            }

            updateMessagePreview();
            renderProgress();
            saveDraft();
        } catch (error) {
            const fallbackMessage = (error && error.message)
                ? error.message
                : "No fue posible activar la ubicacion automatica.";
            setAutoLocationHint(fallbackMessage, true);
        } finally {
            autoLocateBtn.disabled = false;
            autoLocateBtn.classList.remove("is-loading");
        }
    }

    async function resolveLocationForSubmit() {
        let coords = normalizeCoords(state.selectedCoords);

        if (!coords && !state.autoLocationEnabled) {
            const geocoded = await geocodeAddress(addressInput.value.trim());

            if (geocoded && geocoded.coords) {
                coords = geocoded.coords;
                state.selectedCoords = geocoded.coords;
                setSelectedZone(geocoded.coords, { silent: true });
            }
        }

        if (state.autoLocationEnabled && !coords) {
            throw new Error("Activa de nuevo la ubicacion automatica para continuar.");
        }

        if (!state.checkoutConfig.coverageEnabled) {
            state.selectedZone = null;
            renderTotals();
            return {
                coords,
                zone: null
            };
        }

        if (!coords) {
            throw new Error("No se pudo validar cobertura. Revisa direccion o usa ubicacion automatica.");
        }

        const zone = findCoverageZone(coords);
        state.selectedZone = zone;
        renderTotals();

        if (!zone) {
            throw new Error("La direccion registrada esta fuera de zona de cobertura.");
        }

        return {
            coords,
            zone
        };
    }

    function buildPayload(resolved) {
        const customerAddress = state.autoLocationEnabled
            ? "Ubicacion automatica"
            : addressInput.value.trim();

        return {
            customer: {
                name: customerName.value.trim(),
                phone: customerPhone.value.trim(),
                neighborhood: customerNeighborhood.value.trim(),
                address: customerAddress,
                zone: resolved.zone ? resolved.zone.id : "auto"
            },
            location: resolved.coords || null,
            paymentMethod: state.selectedPaymentMethod,
            locationMeta: {
                mode: state.autoLocationEnabled ? "auto" : "manual",
                label: customerAddress,
                resolvedAddress: state.autoResolvedAddress
            },
            notes: buildPreviewMessage(true),
            items: store.getCartLines().map((line) => ({
                id: line.id,
                qty: line.qty
            }))
        };
    }

    async function postJson(url, payload) {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data && data.error ? data.error : "No fue posible procesar la orden.");
        }

        return data;
    }

    function validateForm() {
        if (store.getTotalQty() === 0) {
            setStatus("Debes tener productos en el carrito.", "error");
            return false;
        }

        const nameResult = validateField("customerName", { force: true });
        const phoneResult = validateField("customerPhone", { force: true });
        const neighborhoodResult = validateField("customerNeighborhood", { force: true });
        const addressResult = validateField("addressInput", { force: true });

        if (!nameResult.valid) {
            setStatus("Ingresa nombre completo.", "error");
            customerName.focus();
            return false;
        }

        if (!phoneResult.valid) {
            setStatus("Ingresa un telefono valido.", "error");
            customerPhone.focus();
            return false;
        }

        if (!neighborhoodResult.valid) {
            setStatus("Ingresa el barrio del pedido.", "error");
            customerNeighborhood.focus();
            return false;
        }

        if (!addressResult.valid) {
            setStatus("Ingresa direccion valida o usa ubicacion automatica.", "error");
            addressInput.focus();
            return false;
        }

        if (!state.selectedPaymentMethod) {
            setStatus("Selecciona metodo de pago.", "error");
            return false;
        }

        return true;
    }

    function buildSummaryFromOrder(order, resolved) {
        return {
            reference: order.reference,
            status: order.status,
            createdAt: order.createdAt,
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            customerAddress: order.customerAddress,
            customerNeighborhood: order.customerNeighborhood || order.customerReference || customerNeighborhood.value.trim(),
            zone: order.zone,
            subtotalInCents: toNumber(order.subtotalInCents, store.getSubtotal()),
            shippingInCents: toNumber(order.shippingInCents, getShipping()),
            totalInCents: toNumber(order.totalInCents, store.getSubtotal() + getShipping()),
            items: Array.isArray(order.items)
                ? order.items.map((item) => ({
                    name: item.name || item.id,
                    qty: toNumber(item.qty, 0),
                    totalPrice: toNumber(item.totalPrice, 0)
                }))
                : store.getCartLines(),
            location: order.location || resolved.coords || null,
            invoiceSent: Boolean(order.invoiceSent),
            invoiceMessage: String(order.invoiceMessage || "")
        };
    }

    async function handlePay() {
        if (state.isSubmitting) {
            return;
        }

        if (!validateForm()) {
            return;
        }

        try {
            state.isSubmitting = true;
            setLoading(true, "Enviando...");
            setStatus("Validando cobertura y generando mensaje consolidado...", "");

            const resolved = await resolveLocationForSubmit();
            const payload = buildPayload(resolved);
            const order = await postJson(apiUrl("/create-order"), payload);
            const summary = buildSummaryFromOrder(order, resolved);

            sessionStorage.setItem(store.ORDER_SUMMARY_KEY, JSON.stringify(summary));

            if (state.selectedPaymentMethod === "cash") {
                store.clearCart();
                clearDraft();
                setLoading(false);
                payBtn.disabled = true;
                state.isSubmitting = false;

                setStatus("Pedido enviado a Formspree correctamente.", "ok", { confirmed: true });
                if (deliveryMessageHint) {
                    deliveryMessageHint.textContent = "Mensaje enviado sin redireccion. Puedes regresar al catalogo cuando quieras.";
                }
                return;
            }

            const nextUrl = String(order.nextUrl || "").trim();

            if (nextUrl) {
                setStatus("Pedido creado. Redirigiendo a pasarela...", "ok");
                await sleep(240);
                window.location.assign(nextUrl);
                return;
            }

            window.location.assign(`pasarela.html?reference=${encodeURIComponent(order.reference)}`);
        } catch (error) {
            setStatus(error.message || "No fue posible confirmar el pedido.", "error");
            setLoading(false);
            state.isSubmitting = false;
        }
    }

    function setupInputEvents() {
        customerName.addEventListener("input", () => {
            state.touchedFields.customerName = true;
            validateField("customerName", { force: true });
            updateMessagePreview();
            renderProgress();
            saveDraft();
        });

        customerPhone.addEventListener("input", () => {
            state.touchedFields.customerPhone = true;
            validateField("customerPhone", { force: true });
            updateMessagePreview();
            renderProgress();
            saveDraft();
        });

        customerNeighborhood.addEventListener("input", () => {
            state.touchedFields.customerNeighborhood = true;
            validateField("customerNeighborhood", { force: true });
            updateMessagePreview();
            renderProgress();
            saveDraft();
        });

        addressInput.addEventListener("input", () => {
            if (state.autoLocationEnabled) {
                return;
            }

            state.touchedFields.addressInput = true;
            state.selectedCoords = null;
            state.selectedZone = null;
            renderTotals();
            validateField("addressInput", { force: true });
            updateMessagePreview();
            renderProgress();
            saveDraft();
        });

        customerName.addEventListener("blur", () => {
            state.touchedFields.customerName = true;
            validateField("customerName", { force: true });
            renderProgress();
        });

        customerPhone.addEventListener("blur", () => {
            state.touchedFields.customerPhone = true;
            validateField("customerPhone", { force: true });
            renderProgress();
        });

        customerNeighborhood.addEventListener("blur", () => {
            state.touchedFields.customerNeighborhood = true;
            validateField("customerNeighborhood", { force: true });
            renderProgress();
        });

        addressInput.addEventListener("blur", async () => {
            state.touchedFields.addressInput = true;
            const result = validateField("addressInput", { force: true });

            if (!result.valid || state.autoLocationEnabled || !state.checkoutConfig.coverageEnabled) {
                return;
            }

            const geocoded = await geocodeAddress(addressInput.value.trim());

            if (!geocoded || !geocoded.coords) {
                return;
            }

            state.selectedCoords = geocoded.coords;
            setSelectedZone(geocoded.coords, { silent: true });
            updateMessagePreview();
            renderProgress();
            saveDraft();
        });
    }

    function setupPaymentEvents() {
        if (!paymentOptions) {
            return;
        }

        paymentOptions.addEventListener("click", (event) => {
            const target = event.target;

            if (!(target instanceof HTMLElement)) {
                return;
            }

            const button = target.closest(".payment-option");

            if (!(button instanceof HTMLElement)) {
                return;
            }

            const method = button.getAttribute("data-payment");

            if (!method) {
                return;
            }

            setPaymentMethod(method);
        });

        paymentOptions.addEventListener("keydown", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.classList.contains("payment-option")) {
                return;
            }

            const buttons = Array.from(paymentOptions.querySelectorAll(".payment-option:not([hidden])"));
            if (buttons.length === 0) {
                return;
            }

            const currentIndex = Math.max(0, buttons.indexOf(target));
            const key = event.key;

            if (key === " " || key === "Enter") {
                event.preventDefault();
                const method = target.getAttribute("data-payment");
                if (method) {
                    setPaymentMethod(method);
                }
                return;
            }

            if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(key)) {
                return;
            }

            event.preventDefault();

            let nextIndex = currentIndex;

            if (key === "ArrowRight" || key === "ArrowDown") {
                nextIndex = (currentIndex + 1) % buttons.length;
            } else if (key === "ArrowLeft" || key === "ArrowUp") {
                nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
            } else if (key === "Home") {
                nextIndex = 0;
            } else if (key === "End") {
                nextIndex = buttons.length - 1;
            }

            const nextButton = buttons[nextIndex];
            if (!(nextButton instanceof HTMLElement)) {
                return;
            }

            nextButton.focus();
            const method = nextButton.getAttribute("data-payment");
            if (method) {
                setPaymentMethod(method);
            }
        });
    }

    function setupAutoLocationEvent() {
        autoLocateBtn.addEventListener("click", async () => {
            if (state.autoLocationEnabled) {
                disableAutoLocation();
                return;
            }

            await enableAutoLocation();
        });
    }

    function setupFormEvent() {
        checkinForm.addEventListener("submit", (event) => {
            event.preventDefault();
            handlePay();
        });
    }

    async function init() {
        const hasCart = renderOrderList();

        if (!hasCart) {
            return;
        }

        renderTotals();
        await loadCheckoutConfig();
        const restoredDraft = restoreDraft();

        if (state.selectedPaymentMethod && state.availablePaymentMethods.includes(state.selectedPaymentMethod)) {
            setPaymentMethod(state.selectedPaymentMethod);
        } else if (state.availablePaymentMethods.includes("cash")) {
            setPaymentMethod("cash");
        } else if (state.availablePaymentMethods.length > 0) {
            setPaymentMethod(state.availablePaymentMethods[0]);
        }

        setAutoLocationHint("Ubicacion manual activa.");
        updateMessagePreview();
        renderProgress();
        saveDraft();

        if (restoredDraft) {
            setStatus("Recuperamos tu borrador local para que continues rapido.", "ok", { highlight: true, scroll: false });
        }

        setupInputEvents();
        setupPaymentEvents();
        setupAutoLocationEvent();
        setupFormEvent();
    }

    init().catch(() => {
        setStatus("No fue posible inicializar el check in. Recarga la pagina.", "error");
    });
})();
