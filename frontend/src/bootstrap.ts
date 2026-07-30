import "./browserCompat";

const resetKey = "scholarlm-demo-reset-2026-07-30";

if (localStorage.getItem(resetKey) !== "done") {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("scholarlm-")) localStorage.removeItem(key);
  }
  sessionStorage.clear();
  if ("caches" in globalThis) {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter((name) => /scholarlm|tldraw/i.test(name))
        .map((name) => caches.delete(name)),
    );
  }
  localStorage.setItem(resetKey, "done");
}

void import("./main");
