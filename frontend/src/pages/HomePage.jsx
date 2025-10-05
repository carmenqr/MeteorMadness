// src/pages/HomePage.jsx
import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { mascotSay } from "../utils/mascotBus";

export default function HomePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const mountRef = useRef(null);
  const timeoutsRef = useRef([]);

  useEffect(() => {

    let alive = true;
    let stop = () => { };

    const setSafeTimeout = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timeoutsRef.current.push(id);
      return id;
    };

    (async () => {
      try {
        const { runHomeSimulation } = await import("../simulation/home.js");
        if (!alive) return;

        const cleanupFn = await runHomeSimulation(mountRef.current);
        if (alive && typeof cleanupFn === "function") stop = cleanupFn;

        mascotSay("Welcome to the page! I'm your mission guide, my name is MeteorBot!");

        const sequence = [
          "You can browse the asteroids in the top-right menu.",
          "Or click any asteroid to inspect its parameters!",
          "What's that?! Check Impactor-2025!"
        ];

        const interval = 6500;

        const loopMessages = (index = 0) => {
          setSafeTimeout(() => {
            mascotSay(sequence[index]);
            const nextIndex = (index + 1) % sequence.length;
            loopMessages(nextIndex);
          }, interval);
        };

        setSafeTimeout(() => loopMessages(0), interval);
      } catch (e) {
        console.error("Error iniciando escena:", e);
        mascotSay("Scene failed to load. Try reloading the page.");
      }
    })();

    const handler = (e) => navigate(e.detail);
    window.addEventListener("panel:navigate", handler);

    return () => {
      alive = false;
      window.removeEventListener("panel:navigate", handler);
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      try { stop(); } catch { }
    };
  }, [navigate, location.pathname]);

  return (
    <div
      ref={mountRef}
      style={{
        position: "absolute",
        inset: 0,
        background: "black",
        overflow: "hidden",
      }}
    />
  );
}
