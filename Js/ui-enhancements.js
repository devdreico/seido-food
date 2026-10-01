(function () {
    const docEl = document.documentElement;
    docEl.classList.add("js-enhanced");

    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touchOnly = window.matchMedia("(hover: none)").matches;
    const canVibrate = typeof navigator.vibrate === "function";

    function setupReveal() {
        const nodes = Array.from(document.querySelectorAll(".panel, .form-panel, .summary-panel, .info-card, .thanks-card, .catalog-dock, .loader-card"));

        if (nodes.length === 0) {
            return;
        }

        nodes.forEach((node, index) => {
            node.classList.add("reveal-on-scroll");
            node.style.setProperty("--reveal-delay", `${Math.min(index, 7) * 52}ms`);
        });

        if (reduceMotionQuery.matches || !("IntersectionObserver" in window)) {
            nodes.forEach((node) => node.classList.add("is-visible"));
            return;
        }

        const visibleNow = window.innerHeight * 0.92;

        nodes.forEach((node) => {
            const top = node.getBoundingClientRect().top;
            if (top < visibleNow) {
                node.classList.add("is-visible");
            }
        });

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("is-visible");
                obs.unobserve(entry.target);
            });
        }, {
            threshold: 0.12,
            rootMargin: "0px 0px -10% 0px"
        });

        nodes.forEach((node) => {
            if (!node.classList.contains("is-visible")) {
                observer.observe(node);
            }
        });
    }

    function setupMicroPressFeedback() {
        const selector = ".btn, .chip, .qty-btn, .mode-btn, .payment-option, .header-link";
        let activeElement = null;

        const release = (element) => {
            if (!element) {
                return;
            }

            window.setTimeout(() => {
                element.classList.remove("is-pressed");
            }, 120);
        };

        document.addEventListener("pointerdown", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const interactive = target.closest(selector);
            if (!(interactive instanceof HTMLElement) || interactive.hasAttribute("disabled")) {
                return;
            }

            activeElement = interactive;
            interactive.classList.add("is-pressed");

            if (touchOnly && canVibrate) {
                navigator.vibrate(8);
            }
        }, { passive: true });

        ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
            document.addEventListener(eventName, () => {
                if (!activeElement) {
                    return;
                }

                release(activeElement);
                activeElement = null;
            }, { passive: true });
        });
    }

    function setupScrollAwareHeader() {
        let rafId = 0;

        const update = () => {
            rafId = 0;
            document.body.classList.toggle("is-scrolled", window.scrollY > 16);
        };

        const onScroll = () => {
            if (rafId) {
                return;
            }

            rafId = window.requestAnimationFrame(update);
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        update();
    }

    function setupPointerMotion() {
        if (reduceMotionQuery.matches || touchOnly) {
            return;
        }

        let rafId = 0;
        let nextX = 0;
        let nextY = 0;

        const commit = () => {
            rafId = 0;
            docEl.style.setProperty("--motion-x", nextX.toFixed(3));
            docEl.style.setProperty("--motion-y", nextY.toFixed(3));
        };

        const onPointerMove = (event) => {
            const ratioX = (event.clientX / Math.max(1, window.innerWidth)) - 0.5;
            const ratioY = (event.clientY / Math.max(1, window.innerHeight)) - 0.5;
            nextX = Math.max(-1, Math.min(1, ratioX * 2));
            nextY = Math.max(-1, Math.min(1, ratioY * 2));

            if (!rafId) {
                rafId = window.requestAnimationFrame(commit);
            }
        };

        window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    function setupBrandWatermark() {
        if (document.querySelector(".brand-watermark")) {
            return;
        }

        const watermark = document.createElement("img");
        watermark.className = "brand-watermark";
        watermark.alt = "";
        watermark.decoding = "async";
        watermark.loading = "eager";
        watermark.src = "Assets/Img/logo/logo-fondo-transparente-640.webp";
        watermark.setAttribute("aria-hidden", "true");
        watermark.addEventListener("error", () => {
            watermark.src = "Assets/Img/logo/logo-fondo-transparente-640.png";
        }, { once: true });

        document.body.appendChild(watermark);
    }

    function resolveTransitionUrl(anchor) {
        if (!(anchor instanceof HTMLAnchorElement)) {
            return "";
        }

        if (anchor.target && anchor.target !== "_self") {
            return "";
        }

        if (anchor.hasAttribute("download") || anchor.dataset.noTransition === "true") {
            return "";
        }

        const href = String(anchor.getAttribute("href") || "").trim();
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
            return "";
        }

        let targetUrl = null;

        try {
            targetUrl = new URL(anchor.href, window.location.href);
        } catch (_error) {
            return "";
        }

        if (targetUrl.origin !== window.location.origin) {
            return "";
        }

        if (targetUrl.pathname === window.location.pathname && targetUrl.search === window.location.search) {
            return "";
        }

        return targetUrl.toString();
    }

    function setupPageTransition() {
        if (reduceMotionQuery.matches) {
            return;
        }

        const layer = document.createElement("div");
        layer.className = "page-transition-layer";
        document.body.appendChild(layer);

        let isLeaving = false;

        document.addEventListener("click", (event) => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                return;
            }

            const target = event.target;
            if (!(target instanceof Element)) {
                return;
            }

            const anchor = target.closest("a[href]");
            if (!(anchor instanceof HTMLAnchorElement)) {
                return;
            }

            const nextUrl = resolveTransitionUrl(anchor);
            if (!nextUrl) {
                return;
            }

            event.preventDefault();

            if (isLeaving) {
                return;
            }

            isLeaving = true;
            layer.classList.add("is-active");

            window.setTimeout(() => {
                window.location.assign(nextUrl);
            }, 220);
        });

        window.addEventListener("pageshow", () => {
            isLeaving = false;
            layer.classList.remove("is-active");
        });
    }

    function init() {
        setupReveal();
        setupMicroPressFeedback();
        setupScrollAwareHeader();
        setupPointerMotion();
        setupBrandWatermark();
        setupPageTransition();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
        return;
    }

    init();
})();
