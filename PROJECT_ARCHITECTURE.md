# Transit Intelligence Platform - Technical & Architectural Overview

## 1. Project Vision
The **Transit Intelligence Platform** is a high-performance, real-time fleet management and passenger tracking ecosystem designed for campus-scale transit systems. It bridges the gap between raw GPS data and actionable intelligence through a "Midnight Nebula" design system, providing a premium experience for passengers, drivers, and administrators.

---

## 2. Technical Stack
*   **Frontend**: React.js (Vite)
*   **Styling**: Vanilla CSS with modern utility patterns (Glassmorphism, CSS Variables)
*   **Real-time Engine**: Supabase (PostgreSQL + Real-time Channels)
*   **Maps**: Leaflet.js with React-Leaflet
*   **Animations**: Framer Motion (Hardware-accelerated transitions)
*   **Icons**: Lucide-React
*   **Deployment**: Vercel (Production-ready SPA routing)

---

## 3. System Architecture

### A. Real-time Synchronization Layer
The core of the application relies on the **Supabase Real-time Engine**.
*   **PostgreSQL CDC (Change Data Capture)**: Listens for `INSERT`, `UPDATE`, and `DELETE` events on the `active_buses` table to update the map live without polling.
*   **Presence Channels**: Tracks driver availability and "last seen" heartbeats to handle disconnected states and "Offline" false-positives.
*   **Broadcast Channels**: Enables instant administrative alerts (emergencies, route changes) to be pushed to all users simultaneously.

### B. Context-Driven State Management
The `BusesProvider.jsx` acts as the global "Command Center" for the application:
*   Aggregates live bus positions, route definitions, and passenger feedback.
*   Handles optimistic UI updates for smooth marker transitions.
*   Manages historical data fetching for the "Heat-Replay" system.

---

## 4. Database Schema (Supabase/PostgreSQL)

1.  **`active_buses`**: Stores live telemetry (Lat, Lng, RouteID, Crowd Status, Passenger Count).
2.  **`location_history`**: Time-series storage for every bus coordinate, used for historical auditing and replay.
3.  **`drivers`**: User credentials and assigned bus numbers.
4.  **`routes`**: GeoJSON-style waypoints and stop names for the map overlays.
5.  **`broadcasts`**: Global alert messages with priority levels (Info, Warning, Emergency).
6.  **`traffic_reports`**: Crowd-sourced feedback (Too Hot, Too Cold, Delayed, Full).

---

## 5. Key Technical Implementations

### GPS Optimization & Reliability
*   **Heartbeat Fallback**: The system detects inactive GPS signals after 2 minutes and marks the bus as "Idle" rather than deleting it, preventing flickering on the map.
*   **Battery Saver Mode**: Reduces GPS update frequency and disables heavy map animations/trails to preserve driver device life.
*   **Coordinate Validation**: Strict `NaN` checking and bounding box validation prevent markers from jumping to `0,0` during signal loss.

### Automated Driver Intelligence
*   **Geofencing (50m Radius)**: Automatically triggers "Arriving At" announcements and next-stop notifications for drivers based on proximity to waypoints.
*   **WakeLock API**: Ensures the driver's device screen stays active during tracking to prevent the OS from killing the background GPS process.

### Fleet "Heat-Replay" Engine
*   A timeline-based auditing tool that allows admins to pick a past time window and "replay" bus movements. It calculates historical speeds and route deviations to optimize future schedules.

---

## 6. Design System & Aesthetics (Midnight Nebula)

### A. Color Palette & Theming
The platform uses a curated, high-contrast dark theme with adaptive light-mode support.
*   **Primary Accent**: `#6366f1` (Indigo/Primary) - Used for primary actions, current bus focus, and branding.
*   **Success/Live State**: `#10b981` (Emerald) - Indicates active status and system health.
*   **Backgrounds**: 
    *   Main: `#0a0a0c` (Near black) with subtle indigo/emerald radial gradients.
    *   Cards: `#121215` (Deep charcoal) to provide layered depth.
*   **Borders**: `rgba(255, 255, 255, 0.08)` - Thin, high-precision borders for a premium "glass" look.

### B. Typography
*   **Headings**: *Outfit* (Sans-serif) - Chosen for its modern, geometric feel. Used with `letter-spacing: -0.02em` for a tight, high-end dashboard appearance.
*   **Body & Stats**: *Inter* - Optimized for readability of small numeric values and tracking data.
*   **Title Gradients**: Uses a `linear-gradient(135deg, #fff 0%, #a1a1aa 100%)` with text-clipping for headers.

### C. Component DNA (Glassmorphism)
All UI elements follow a strict "Layered Glass" design language:
*   **Transparency**: `backdrop-filter: blur(20px)` and semi-transparent backgrounds allow map context to bleed through.
*   **Shadows**: Deep, multi-layered shadows (`0 20px 25px -5px rgba(0, 0, 0, 0.2)`) provide clear visual elevation.
*   **Interactive States**: Components use a `cubic-bezier(0.4, 0, 0.2, 1)` transition for all hover/active states, creating a "fluid" rather than "snappy" feel.

### D. Micro-Animations & Visual Cues
*   **Pulse Indicators**: Active bus markers and "System Health" badges use a CSS keyframe pulse to indicate "live" data transmission.
*   **Hardware Acceleration**: All layout shifts and sidebar interactions are handled via Framer Motion's `animate` prop to ensure 60fps performance on mobile.
*   **Smooth Map Tracking**: Bus icons utilize a `transition: all 5.5s linear` to simulate smooth vehicle movement between GPS pings.

---

## 7. Responsive Dashboard Strategy
The platform employs a **Unified Dashboard Architecture**:
*   **Desktop**: A 2-column grid layout with a 380px command sidebar.
*   **Mobile**: A synchronized single-column stack that preserves all data-heavy components (Stats, Bus Buzz, Trip Planner).
*   **Adaptive Map Height**: Map height scales dynamically from `50vh` on mobile to `700px` on high-resolution monitors to maximize geographical context.

---

## 8. Deployment & Routing
The application is configured with `vercel.json` to handle Single Page Application (SPA) routing, ensuring that sub-routes like `/driver` or `/admin` remain accessible even after a browser refresh on production servers.
