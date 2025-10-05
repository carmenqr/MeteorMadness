import React, { useEffect, useMemo, useRef, useState } from "react";
import "./Mascot.css";
import happyRobot from "../assets/happy_robot.png";

export default function Mascot({
    pixelSize = 4,
    direction = "right",
    frameDurationMs = 220,
    style = {},
    className = "",
    messages = [],
    spriteSrc = happyRobot,
    auto = true,
    minDelayMs = 15000,
    maxDelayMs = 30000,
    showMs = 5000,
    storageKey = null,
    allowRepeat = true,
    eventName = "mascot:message",
    variant = "bubble",
    defaultMessage = "",
    bubbleRight = false,
    offsetRight = 20,
    offsetBottom = 16,
    gapPx = 1,
    bubbleNudgePx = 6,
}) {
    const [visibleMsg, setVisibleMsg] = useState(null);
    const poolRef = useRef(messages.slice());
    const timerRef = useRef(null);
    const hideRef = useRef(null);

    const baseMessages = useMemo(() => messages.filter(Boolean), [messages]);

    const pickMessage = () => {
        if (baseMessages.length === 0) return null;
        if (allowRepeat) {
            const i = Math.floor(Math.random() * baseMessages.length);
            return baseMessages[i];
        }
        if (poolRef.current.length === 0) poolRef.current = baseMessages.slice();
        const i = Math.floor(Math.random() * poolRef.current.length);
        return poolRef.current.splice(i, 1)[0];
    };

    const showMessage = (msg) => {
        if (!msg) return;
        if (hideRef.current) clearTimeout(hideRef.current);
        setVisibleMsg(msg);
        hideRef.current = setTimeout(() => {
            if (defaultMessage) setVisibleMsg(defaultMessage);
            else setVisibleMsg(null);
        }, showMs);
    };

    useEffect(() => {
        if (!auto || baseMessages.length === 0) return;
        if (storageKey && sessionStorage.getItem(storageKey) === "done") return;

        const scheduleNext = () => {
            const delay = Math.floor(Math.random() * (maxDelayMs - minDelayMs + 1)) + minDelayMs;
            timerRef.current = setTimeout(() => {
                const msg = pickMessage();
                if (msg) showMessage(msg);
                scheduleNext();
            }, delay);
        };

        scheduleNext();
        if (storageKey) sessionStorage.setItem(storageKey, "done");

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            if (hideRef.current) clearTimeout(hideRef.current);
        };
    }, [auto, baseMessages.length, minDelayMs, maxDelayMs, showMs, storageKey, defaultMessage]);

    useEffect(() => {
        const handler = (e) => {
            const msg = (e && e.detail) || pickMessage();
            showMessage(msg);
        };
        window.addEventListener(eventName, handler);
        return () => window.removeEventListener(eventName, handler);
    }, [eventName]);

    useEffect(() => {
        return () => {
            if (hideRef.current) clearTimeout(hideRef.current);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    return (
        <div
            className={`Mascot ${className}`}
            style={{
                position: "fixed",
                ...style,
                right: offsetRight,
                bottom: offsetBottom,
                zIndex: 9999,
                pointerEvents: "none",
            }}
            aria-live="polite"
        >
            <div
                className={`Mascot_wrap ${bubbleRight ? "Mascot_wrap--bubble-right" : ""}`}
                style={{ gap: `${gapPx}px` }}
            >
                {visibleMsg && (
                    <div
                        className="Mascot_bubble"
                        role="status"
                        style={{ marginRight: `-${Math.max(0, bubbleNudgePx)}px` }}
                    >
                        <p>{visibleMsg}</p>
                    </div>
                )}

                <img
                    src={spriteSrc}
                    alt="Happy Robot"
                    className="Mascot_sprite"
                    style={{
                        width: pixelSize * 56,
                        height: "auto",
                        pointerEvents: "none",
                        imageRendering: "pixelated",
                        transform: direction === "left" ? "scaleX(-1)" : "none",
                        filter:
                            "drop-shadow(0 0 6px rgba(255,255,255,0.35)) drop-shadow(0 0 10px rgba(0,255,255,0.2))",
                    }}
                />
            </div>
        </div>
    );
}
