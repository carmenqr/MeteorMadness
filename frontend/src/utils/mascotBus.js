// src/utils/mascotBus.js
export const MASCOT_EVENT = "mascot:message";

export function mascotSay(message) {
    window.dispatchEvent(new CustomEvent(MASCOT_EVENT, { detail: message }));
}

export function mascotRandom() {
    window.dispatchEvent(new CustomEvent(MASCOT_EVENT));
}

export function mascotClear() {
    activeTimeouts.forEach(clearTimeout);
    activeTimeouts = [];
    const bubble = document.querySelector(".Mascot_bubble");
    if (bubble) bubble.textContent = "";
}