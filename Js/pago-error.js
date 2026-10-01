(function () {
    const node = document.getElementById("errorReference");
    if (!node) {
        return;
    }

    const params = new URLSearchParams(window.location.search);
    const reference = String(params.get("reference") || "").trim();

    node.textContent = reference || "-";
})();