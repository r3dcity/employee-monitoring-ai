// Base URL of the Flask API. Set VITE_API_URL at build time (e.g. "/api" behind the nginx proxy).
export const SERVER_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";
