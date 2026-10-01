(function () {
    const loaderFill = document.getElementById("loaderFill");
    const loaderNote = document.getElementById("loaderNote");
    const loaderSteps = Array.from(document.querySelectorAll("[data-loader-step]"));
    const LOADER_FLAG = "seido_loader_seen_v1";

    if (!loaderFill || !loaderNote) {
        window.location.replace("inicio.html");
        return;
    }

    // Skip artificial wait for repeated visits to keep the flow fast.
    if (sessionStorage.getItem(LOADER_FLAG) === "1") {
        window.location.replace("inicio.html");
        return;
    }
    sessionStorage.setItem(LOADER_FLAG, "1");

    const milestones = [
        { progress: 14, note: "Alineando identidad visual...", step: 0 },
        { progress: 42, note: "Montando catalogo y filtros...", step: 1 },
        { progress: 73, note: "Afinando check in y coberturas...", step: 1 },
        { progress: 92, note: "Experiencia lista para ordenar.", step: 2 }
    ];

    let progress = 6;
    let milestoneIndex = 0;
    let noteSwapTimer = 0;

    function setStep(stepIndex) {
        if (loaderSteps.length === 0) {
            return;
        }

        loaderSteps.forEach((node, index) => {
            node.classList.toggle("is-active", index <= stepIndex);
        });
    }

    function setNote(note) {
        if (!note) {
            return;
        }

        loaderNote.classList.add("is-swapping");

        window.clearTimeout(noteSwapTimer);
        noteSwapTimer = window.setTimeout(() => {
            loaderNote.textContent = note;
            loaderNote.classList.remove("is-swapping");
        }, 120);
    }

    function applyMilestones() {
        while (milestoneIndex < milestones.length && progress >= milestones[milestoneIndex].progress) {
            const current = milestones[milestoneIndex];
            setStep(current.step);
            setNote(current.note);
            milestoneIndex += 1;
        }
    }

    loaderFill.style.width = `${progress}%`;
    setStep(0);
    setNote("Preparando experiencia...");

    const progressTimer = window.setInterval(() => {
        const remaining = 95 - progress;
        const randomBoost = 1.4 + (Math.random() * Math.max(1.6, remaining * 0.2));
        progress = Math.min(95, progress + randomBoost);
        loaderFill.style.width = `${progress}%`;
        applyMilestones();

        if (progress >= 95) {
            window.clearInterval(progressTimer);
        }
    }, 150);

    window.setTimeout(() => {
        window.clearInterval(progressTimer);
        progress = 100;
        loaderFill.style.width = "100%";
        setStep(2);
        setNote("Listo. Redirigiendo...");

        window.setTimeout(() => {
            window.location.replace("inicio.html");
        }, 320);
    }, 1700);
})();
