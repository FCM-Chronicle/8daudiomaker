if (typeof window === 'undefined') {
    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("fetch", (event) => {
        if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") {
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.status === 0) {
                        return response;
                    }

                    const newHeaders = new Headers(response.headers);
                    newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                })
                .catch((e) => {
                    console.error(e);
                })
        );
    });
} else {
    // Active script running in window
    const script = document.currentScript;
    const workerUrl = script ? script.src : "coi-serviceworker.js";
    
    if (window.crossOriginIsolated === false) {
        navigator.serviceWorker.register(workerUrl).then((registration) => {
            registration.addEventListener("updatefound", () => {
                window.location.reload();
            });
            if (registration.active) {
                window.location.reload();
            }
        }).catch((err) => {
            console.error("COOP/COEP Service Worker registration failed:", err);
        });
    }
}
