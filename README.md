<div align="center">

# 🌐 God's Eye View

[![CI](https://github.com/bilawalsidhu/gods-eye-view/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bilawalsidhu/gods-eye-view/actions/workflows/ci.yml) [![Reached #1 on GitHub Trending](https://img.shields.io/badge/%231_GitHub_Trending-thank_you!-F0A63C?style=flat-square&logo=github)](https://x.com/bilawalsidhu/status/2093798887815348521)

### A spy-satellite simulator in your browser — then you realize the sources are public and the data is real.

Photorealistic 3D globe. Live aircraft, ships, satellites, earthquakes, traffic, and public cameras. Hands-free voice control powered by a realtime AI agent.

_No place left behind._

![Orbital HUD, a tracked live globe, FLIR terrain — then OPEN SOURCED](docs/media/hero-open-source-reveal.gif)

<a href="https://www.youtube.com/@bilawalsidhu">
  <img src="docs/media/youtube-popular-videos.png" alt="The God's Eye View video series on YouTube" width="100%">
</a>

▶️ **From the project behind the viral God's Eye View series** _(formerly WorldView)_ — [5M+ on YouTube](https://youtube.com/playlist?list=PL6qSg2I-7_koPbDnSMo0QeeHX_RknA2uv&si=nBGYMoHWQw41v93Q) · [25M+ across socials](https://www.google.com/search?q=god%27s+eye+view)

🏆 **Reached #1 on GitHub Trending, daily and weekly · August 2026**

**[#8 Product of the Day](https://www.producthunt.com/products/god-s-eye-view?launch=god-s-eye-view)** · Hunted by Chris Messina, creator of the hashtag

_“pretty cool”_ — [Brendan Eich](https://x.com/BrendanEich/status/2094592096401490266), creator of JavaScript and co-founder of Mozilla and Brave · Featured on **[Pinokio](https://pinokio.co/posts/01m1m4p9xxm3qw7dnnpj2wr93g)**

⚡ **Start without API keys.** Install with [Pinokio](https://pinokio.co/apps/github-com-bilawalsidhu-gods-eye-view) or run locally from the terminal. Add optional keys inside the app. **[→ Quick Start](#-quick-start)**

</div>

---

<div align="center">

**[Quick Start](#-quick-start) · [First Five Minutes](#-the-first-five-minutes) · [Talk to It](#-talk-to-it) · [What's Live](#-whats-on-the-globe) · [Under the Hood](#-under-the-hood) · [Keys & Costs](#-api-keys) · [Contributing](CONTRIBUTING.md)**

</div>

---

## 🌍 Why This Exists

God's Eye View brings public signals into one explorable globe. Track the world live. Talk to it. Break it. Extend it.

Flight transponders, ship beacons, orbital elements, seismographs, and public cameras already tell us a lot about the world. God's Eye View puts them in the same place, so you can move between a global picture and an individual aircraft, ship, or street. It runs locally in your browser, with source code you can inspect and extend.

> Half the magic is that it looks like a forbidden cockpit. The other half is that every line of code is inspectable.

Most feeds are live or regularly refreshed. Traffic is simulated along real
roads using aggregate location data. CCTV camera poses and rocket launch
trajectories are coarse estimates.

Start with the included data sources, then add your own. Each layer is a separate module.

---

## 🎛️ What This Thing Does

- **🛩️ Cockpit view:** Ride inside a tracked flight — the camera holds the terrain under you all the way down.
- **📡 Contacts:** A 250 km roster of everything near your target — step through live aircraft and drop into any cockpit.
- **🎯 Click-to-track anything:** Camera locks on, draws a fading trail, surfaces full metadata — and a tracked fire or vessel hands you off to the nearest live camera in one click.
- **🖊️ Voice whiteboard:** Speak annotations onto the world — real boundary polygons, marks, and routes.
- **🛫 3D hangar:** Real per-class aircraft models — 787, ATR-72, Citation, Bell 206, MQ-9 — and a tracked contact swaps from glyph to 3D model as you close in.
- **🎨 Reskin reality:** GLSL sensor looks over the normal globe — CRT, NVG, FLIR/thermal, Noir, Snow.
- **🟩 Detection overlay:** Screen-space bounding boxes and IDs on everything in view.
- **🎖️ Military HUD:** Tactical heads-up display with intelligence-style telemetry.
- **🌐 Global Context:** Stage the full situational picture with one switch — and get your exact view back when you leave.
- **🎥 Scene director:** Capture cinematic camera tours for clips and demos.
- **🔗 Share Links:** Camera, style, layers, and even one tracked target serialize into a URL — a live target is a handoff, not a bookmark.
- **🏠 Reset Globe:** One control — or one sentence — back to the full Earth.
- **🌦️ Weather:** Animate GFS or ECMWF forecast wind, replay observed radar, satellite clouds and lightning on one timeline, and follow NHC/CPHC cyclone tracks. No key needed.
- **📷 Mapped ALPR cameras:** License-plate-reader camera locations tagged in OpenStreetMap, one city at a time. Locations and tags only; no key needed.
- **🔭 Satellite passes:** Ask by voice when any loaded satellite next rises over you: rise, peak and set times, and whether you can see it.
- **🔎 Analyst answers:** Count, filter and rank satellites, datacenters and dams by voice, alongside flights, ships, fires and quakes; answers say when a feed is stale or on a fallback.
- **🧭 Tilt and North Up:** Switch between straight-down and a 35° oblique, or put north at the top, while a tracked target stays centered.
- **🔍 Keyless search:** Type coordinates or a bundled city or landmark to fly there with no network request; other names use Google when configured, then Photon and Nominatim.
- **📦 Shareable scenes:** Import, preview and share Director scenes as files or bundles, with camera anchors, authored moves and data packs.
- **🌊 Nepal flood scene:** Replay the Bhote Koshi flood: flood path, witness sources and before-and-after imagery (bundled data is non-commercial; see [DATA_SOURCES.md](DATA_SOURCES.md)).

---

<div align="center">

[![YouTube video about the God's Eye View open source release](https://img.youtube.com/vi/GRJaKcXZS94/maxresdefault.jpg)](https://www.youtube.com/watch?v=GRJaKcXZS94)

▶️ **[The full walkthrough of everything below, on YouTube](https://www.youtube.com/watch?v=GRJaKcXZS94)**

</div>

## ⚡ Quick Start

**Start without an account or API keys.** Both paths open the same app with
Esri satellite imagery and keyless terrain. OSM is the fallback if Esri is
unreachable. Flights, military traffic, satellites, earthquakes, public
cameras, radio, and launches are available without keys.

For photorealistic 3D, add a **Cesium ion token** for eligible personal,
non-commercial use, or a **Google Maps key** for the direct, metered route and
Google place search. Provider terms and quotas apply. Add keys through the
app's **POWER UP** panel; [Keys & Costs](#-api-keys) explains the options.

> **Already installed?** Update to the latest version. Older versions query
> public OpenStreetMap Overpass servers, which now refuse them, so Traffic,
> Mapped Installations and ALPR stay empty until you update.

### Path 1 — One click, no terminal

1. Install or update [Pinokio](https://desktop.pinokio.co/) to **8.2 or later**.
2. Open [God's Eye View in Pinokio](https://pinokio.co/apps/github-com-bilawalsidhu-gods-eye-view).
3. Click **Install**, then **Start**.

Available on **Windows, macOS, and Linux**. The Pinokio maintainer reports
cross-platform testing of the fixed installer. The launcher installs the
locked dependencies, finds a free local port, and opens the app.

**Tried before and installation failed?** Update Pinokio and try again.
Version 8.2 fixes the launcher installation issue;
[details from the Pinokio maintainer](https://pinokio.co/posts/01m1m4p9xxm3qw7dnnpj2wr93g).

### Path 2 — Terminal / coding agent

Use **Node.js 24.x (24.14.0 or later) or 26.x**. The setup doctor warns about
Node 25, which is end-of-life.

```bash
git clone https://github.com/bilawalsidhu/gods-eye-view.git
cd gods-eye-view
npm ci
npm run doctor
npm run dev
```

Open **`http://localhost:4173`**. Choose **Live Contacts**, **Space Missions**,
**Environmental**, or **Explore Manually** from the first-run panel.

<details>
<summary>Startup performance</summary>

A point-in-time M5/Chrome capture measured a median 1.86-second cold start.
This is a comparison baseline, not a guarantee for your machine or connection.
See [docs/PERFORMANCE.md](docs/PERFORMANCE.md).

</details>

**macOS shortcut:** `./scripts/dev-fresh.sh` clears the Vite cache and pulls any
configured keys straight from the Keychain. It starts keyless too.

### Then power it up — in the app, not in a file

Keys are upgrades, not prerequisites. When you want one, click the **POWER UP**
chip in the bottom-right corner: Provider Settings lists every supported key,
what it switches on, and where to get it. Paste, hit **SAVE KEYS**, and the app
restarts itself with the new capability on. Once everything is configured the
chip reads **POWERED UP** — and if a compact layout hides it, `?setup=1`
reopens the same panel.

- **Where keys land:** Pinokio → the app's ignored `pinokio/ENVIRONMENT`; a
  terminal clone → the repo-root `.env`. Either file is made owner-only
  _before_ a secret is written into it. These are local plaintext files,
  excluded from Git; the app uses your keys to contact the providers.
- **Keys you already have stay yours:** values from your shell or the macOS
  Keychain show as _configured externally_ and are read-only to the panel.
- **What to get first:** the free [Cesium ion](https://cesium.com/ion) token
  (eligible personal, non-commercial use; current terms and quotas apply) for
  photorealistic 3D and world terrain; a Google Maps key only for the
  billing-enabled, metered route + Google place search; OpenAI when you want to
  talk to the world. Full map, costs included, in [Keys & Costs](#-api-keys).

<details>
<summary>Older Pinokio versions and credential storage</summary>

Do not enter credentials in Pinokio 8.0.40's native **Configure** panel: that
release does not save this nested app file correctly, and it logs submitted
values. Use **POWER UP → Provider Settings** inside GEV instead. The Pinokio
8.2 announcement fixes installation; it does not establish that this separate
Configure issue is resolved. On macOS, the Keychain via
`./scripts/dev-fresh.sh` remains the stronger storage option.

</details>

The server binds to **localhost** on both paths, and Provider Settings answers
requests only from your machine. Browser-side keys (Google Maps, Cesium ion)
must be restricted at their providers — [SECURITY.md](SECURITY.md) shows how,
and it carries the LAN-sharing rules alongside [Keys & Costs](#-api-keys).

---

## 🕐 The First Five Minutes

Choose a first-run mission, or try these in order. The GIFs show Google Photorealistic 3D; your starting basemap depends on the keys you've added.

1. **Light up the sky.** Take the **Live Contacts** mission (or turn on **Flights** yourself) — thousands of live aircraft, gliding on real telemetry, detection mesh already reading the scene. Click one: the camera locks on, a trail draws behind it, and its live telemetry card comes up.
2. **Take the controls.** Hit **COCKPIT** on your tracked plane and ride it down, switching sensors mid-flight: NVG into Ironbow FLIR.

![Riding with a live aircraft in cockpit view while switching sensor modes](docs/media/06-cockpit-ar.gif)

3. **Drop into a busy airport.** Search one and descend to the taxiways with **3D** aircraft on — grounded contacts, taxi trails, the whole apron working in real time.

![Moving from a full airport overhead down to close taxiway inspection with 3D flight models](docs/media/start-here/airport-ground-traffic-google-3d.gif)

4. **Look through a public camera.** Turn on **Cameras** over Austin, London, California, Finland, or Delaware (live video). The feeds aren't webcam embeds — they project _into_ the 3D city. Cycle coverage to **VIEWSHED** and every camera draws its estimated coverage volume — where it reaches, and where it goes blind.

![Diving into an Austin intersection with a live public camera projected into the 3D scene](docs/media/03-austin-cctv.gif)

5. **Track something in orbit.** Turn on **Satellites** and click the ISS — you ride along at orbital distance, orbit ring and all.

   Amateur-radio satellites are included in the same layer: look for the green
   **AMATEUR RADIO** legend and markers. Click a satellite to see its name,
   NORAD ID, altitude, orbital-elements epoch and orbit, and follow its predicted
   position. The ISS remains in **STATION**, even though it carries amateur
   radio equipment. No API key or DENSE mode is needed. Positions are calculated
   using SGP4 from CelesTrak's `amateur` catalogue; they are not live GPS reports.
   Catalogue membership does not confirm that a transponder is working, a
   frequency is active, or the satellite is receivable from your location.

   With an amateur satellite or the ISS selected, click the **SatNOGS** chip
   on the Satellites row. It shows recent completed observations, UTC times,
   contributing ground stations, reported signal quality and demodulated-file
   counts. Choose **Load recorded audio (not live)**, then press Play, or
   **Show waterfall** when available. These are historical recordings, possibly
   telemetry or noise, not continuous live audio or decoded engineering values.
   No SatNOGS account/key is needed. Closing the panel, changing satellite or
   disabling Satellites stops the recording.

![Tracking the ISS along its orbital path as it crosses over Ukraine](docs/media/14-iss-over-ukraine.gif)

6. **Switch the optics.** Tap `1`–`7` — CRT, NVG, FLIR — and the whole live planet re-renders through a different sensor.

![Cycling a dense live globe through CRT, FLIR, and NVG in one continuous view](docs/media/01-style-sweep.gif)

7. **Talk to it** _(needs an OpenAI key)_: _"Take me to LAX and select the nearest airborne aircraft."_
8. **Come home.** Hit **Reset Globe** — or just say _"zoom out to a globe view."_

**Keyboard:** `1`–`7` visual styles · `H` HUD · `D` detection · `C` cockpit · `` ` `` frame rate · `Esc` out. Trackpad pinch zooms the globe.

---

## 🛩️ The Cockpit

> Every plane should let you do this.

Real-time cockpit mode, built from live flight data: the camera rides your contact with real terrain holding underneath, all the way down — sensor styles come along for the ride, and **Contacts** keeps the 250 km roster one click away: jump plane to plane and fall straight into the next cockpit.

![Jumping between live aircraft and falling straight into a cockpit view](docs/media/12-switch-aircraft-cockpit.gif)

The cockpit even carries its own briefing strip: nearby live signals, regional headlines, and real local weather — with an opt-in **WX** mode that renders volumetric clouds from actual observations around your aircraft.

![A live military contact ridden through Normal, NVG, and Ironbow FLIR with dense detection](docs/media/start-here/military-cockpit-dense-google-3d.gif)

_Why cockpit mode exists: you're riding a real aircraft over real terrain — and you get to pick which sensor you see the world through._

---

## 🎙️ Talk to It

> Voice can use an **OpenAI API key** or, on the same machine, an opt-in signed-in **ChatGPT/Codex OAuth** session. The API-key path remains the default. Selecting ChatGPT OAuth in Provider Settings reuses an existing local sign-in or starts the Codex browser sign-in flow and selects OAuth when it completes. The OpenAI key still drives the **AI HUD summary**: a terse, five-word intelligence-style readout of the current view that regenerates as you move.

The OAuth option is experimental. OpenAI documents ChatGPT plan usage for the [Responses API](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference); a supported third-party Realtime contract for reusing Codex tokens has not been confirmed. A successful token mint does not establish billing or support terms.

GEV reads Codex's file credentials but does not write or refresh them. It checks token shape and expiry, and reports expired sign-in as requiring re-authentication. The login button runs `codex login`, permits one pending attempt, and reports exit failures or a two-minute timeout. `CODEX_HOME` must match the directory that Codex uses. If `CODEX_AUTH_JSON` points elsewhere, sign in separately or fix that mismatch before using the button. Codex credential storage must use `auth.json`; Keychain-only and in-memory storage are not readable by GEV. On Windows, the login button may not be able to start an npm-installed Codex; run `codex login` yourself, then select OAuth. See [Codex credential storage](https://learn.chatgpt.com/docs/auth#credential-storage).

For a live voice check, run `node scripts/qa-voice-auth.mjs http://127.0.0.1:4189 oauth microphone.wav` against your local dev server. Use a WAV with three seconds of leading silence followed by a short spoken reply request. Replace `oauth` with `api-key` to check the API-key path. The check verifies audio input, a completed spoken reply, usage, resource cleanup, and reconnect. It saves screenshots and credential-free results under `.gev-logs/voice-auth/`.

Click **GEV MIC**, grant the microphone, and just talk. This is more than a voice-controlled remote:

- **🧠 It knows what it's looking at.** The agent pulls live scene context before answering — including coordinates, street names, active layers, and view scale. Ask _"what city is this?"_ mid-flight and it knows.
- **🎯 Entity Q&A.** Click any plane, ship, or datacenter and ask _"what's this?"_ It answers using the object's live telemetry.
- **👁️ Visual grounding.** At street level, it reads a viewport screenshot to identify legible signage and building names, and is instructed never to hallucinate labels.
- **🎬 Cinematic framing.** _"Show me the planes overhead"_ pulls the camera back, angles it, and frames the live traffic like a director.
- **🔒 Honest and secure.** The agent only confirms actions that succeeded. Your `OPENAI_API_KEY` never touches the browser; the client only gets a short-lived session token. If you choose **USE CHATGPT OAUTH** in Provider Settings, the local server uses that sign-in only to mint the same kind of short-lived Realtime credential, and refuses the OAuth path for non-loopback clients.

Thirty tools, four jobs — the commands below come straight from the product's voice test suite and tool playbook:

**🎥 Direct it** — drone-operator camera verbs:

> 🗣️ _"Take me to Tokyo."_ · _"Orbit around this area slowly."_ · _"Draw the walking route from the Capitol to Zilker Park."_ → _"Fly the route we just drew."_ · _"Zoom out to a globe view."_

**🖊️ Annotate it** — a whiteboard over the real world:

> 🗣️ _"Outline the state of Texas."_ · _"Annotate the Texas State Capitol and its grounds"_ — it draws the **actual enclosing boundary**, not a circle. · _"How far is the Eiffel Tower from the Louvre?"_ — a connector arrow appears and it speaks the distance. Everything persists until you say _"clear the map."_

**✍️ Or draw it yourself** — DISPLAY ▸ **Draw**: pick Area, Line or Pin, click the vertices on the real world, double-click to finish, label it. Same whiteboard, same persistence, no microphone needed.

![Zilker Park and Lady Bird Lake drawing onto the 3D city as persistent vector annotations, by voice](docs/media/01-voice-annotate-zilker.gif)

![A spoken distance measurement spanning an airport, inspected from orbit](docs/media/04-airport-distance.gif)

**🔎 Interrogate it** — analyst queries against the live layers:

> 🗣️ _"How many flights are over Texas right now?"_ · _"Which ships are headed to Oakland?"_ · _"What is the biggest fire near Los Angeles?"_ · _"Is anything flying above forty thousand feet?"_ · _"When does the ISS pass over next?"_ · _"How many datacenters are in view?"_

**🎛️ Operate it** — the whole console, hands-free:

> 🗣️ _"Switch to night vision and turn on the flights layer."_ · _"Turn on the camera viewsheds."_ · _"Play a news radio station near Austin."_ · _"Track that plane."_ → _"Enter Cockpit."_

**And the rapid-fire tier** — one sentence each:

> 🗣️ _"Show me global infrastructure."_ (stages the layers and pulls back to the globe) · _"Play Orbital Watch."_ (a full cinematic scene) · _"Set detection density to fifty percent."_ · _"Next contact — helicopters only."_ (mid-cockpit) · _"Show me space missions."_ · _"Switch to OSM."_ · _"Sharpen the image a touch."_ · _"Switch to the tactical layout."_ · _"What's turned on right now?"_

![The globe populating with the world's radio stations as another live layer](docs/media/15-global-radio-layer.gif)

_Ask for radio near anywhere and the globe starts broadcasting — every station is a real place you can fly to._

---

**💬 Or ask from Claude and Codex.** God's Eye View is also an MCP server: ask Claude Desktop, Codex or ChatGPT desktop to show a place, and the live globe opens right in the conversation. Setup takes a minute — see [docs/MCP_SETUP.md](docs/MCP_SETUP.md).

## 🛰️ What's on the Globe

Twenty layers and map sources. **Seventeen have a keyless path.** Some offer additional capabilities with a provider key. (🟢 no key · 🟡 free key · 🔴 metered.)

| Layer                       | What you get                                                                                                                                                                                                                                                                                                                                                                        | Source                                  | Auth                                                                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 🗺️ **Map Stack**            | Esri satellite imagery, Google Photorealistic 3D, OSM, plus additional ion-hosted stacks                                                                                                                                                                                                                                                                                            | Esri / Google / Ion / OSM               | 🟢 Esri satellite + OSM · 🟡 ion-hosted Google 3D + world terrain · 🔴 direct Google + place search |
| ✈️ **Live Flights**         | 11,000+ live aircraft + route history                                                                                                                                                                                                                                                                                                                                               | OpenSky + adsb.lol                      | 🟢 (🟡 optional for more polling credits)                                                           |
| 🎖️ **Military Flights**     | ADS-B military traffic in amber                                                                                                                                                                                                                                                                                                                                                     | adsb.lol                                | 🟢                                                                                                  |
| 🚢 **Live Vessels**         | Thousands of ships worldwide                                                                                                                                                                                                                                                                                                                                                        | AISStream                               | 🟡                                                                                                  |
| 🛰️ **Satellites**           | CelesTrak catalog including green **AMATEUR RADIO** satellites, color-coded by class with a live legend — the **DENSE** chip drops in the whole Starlink shell                                                                                                                                                                                                                                                                  | CelesTrak                               | 🟢                                                                                                  |
| 🌍 **Earthquakes**          | Global seismic activity, last 24h                                                                                                                                                                                                                                                                                                                                                   | USGS                                    | 🟢                                                                                                  |
| 🚗 **Traffic**              | Simulated vehicles on OSM roads. With TomTom, live flow speeds drive the simulation and congestion colors below ~8 km; individual vehicle positions are not live observations                                                                                                                                                                                                       | TomTom + OSM                            | 🟢 simulation · 🟡 live flow speeds                                                                 |
| 📹 **CCTV Mesh**            | ~3,900 public cameras projected _into_ the 3D space — Austin · Texas (TxDOT) · California (Caltrans) · London (TfL) · Ontario (511) · Finland (Fintraffic) · British Columbia (DriveBC) · Estonia (Tallinn, Tarktee) · Delaware (DelDOT live video) · New South Wales (Live Traffic NSW) · Calgary · Norway (Statens vegvesen). Positions are published; poses are estimated priors **you calibrate by dragging a gizmo on the camera itself** | City APIs                               | 🟢                                                                                                  |
| 📷 **Mapped ALPR Cameras**  | License-plate-reader camera locations tagged by OpenStreetMap contributors, loaded one city-sized view at a time, with **SHOW NEAREST**. Locations and tags only: no plate data, no video                                                                                                                                                                                           | OpenStreetMap (incl. DeFlock mapping)   | 🟢                                                                                                  |
| 📷 **Street Level**         | Street-level photos behind one panel, one chip per provider: coverage on the streets, image cones, an embedded viewer and **FOLLOW**. Mapillary first; Panoramax, KartaView and Google Street View planned                                                                                                                                                                          | Mapillary                               | 🟡 Mapillary client token                                                                           |
| 📻 **Radio**                | Geolocated world radio with an **analog tuner** — drag the needle across up to 750 stations and the globe flies to each broadcaster                                                                                                                                                                                                                                                 | Radio Browser / broadcasters            | 🟢                                                                                                  |
| 🚌 **Transit**              | Live buses, trams, metros, trains and ferries with delayed playback between reports, selected-vehicle trails, and mode-coloured DETECT labels — Boston, Austin, Minneapolis, Helsinki, the Netherlands, Norway, South East Queensland                                                                                                                                               | Operator GTFS-Realtime feeds            | 🟢                                                                                                  |
| 🚲 **Bikeshare**            | Live station availability                                                                                                                                                                                                                                                                                                                                                           | GBFS                                    | 🟢                                                                                                  |
| 🧭 **Directions**           | Click A and B on the globe for a street-following drive, walk or cycle route draped on the terrain with turn-by-turn steps — then FLY the camera along it. No key, no geocoder, no mic                                                                                                                                                                                              | OSRM on FOSSGIS servers (OpenStreetMap) | 🟢                                                                                                  |
| 🔥 **Active Fires**         | Live NASA FIRMS detections, trailing 24h                                                                                                                                                                                                                                                                                                                                            | NASA FIRMS                              | 🟡                                                                                                  |
| 🚀 **Space Missions**       | Rolling 30-day launches with payload, stage, and recovery detail                                                                                                                                                                                                                                                                                                                    | Launch Library 2                        | 🟢 (🟡 optional token raises the allowance)                                                         |
| 🎖️ **Mapped Installations** | Viewport-bounded military-site context from community mapping — incomplete by nature, and labeled that way                                                                                                                                                                                                                                                                          | OpenStreetMap                           | 🟢                                                                                                  |
| 🌬️ **Wind**                 | Animated 10 m forecast wind with an optional speed, temperature or pressure color field and a reading at map center                                                                                                                                                                                                                                                                 | NOAA GFS / ECMWF IFS                    | 🟢                                                                                                  |
| 🌦️ **Observed Weather**     | Rain radar (contiguous US), Satellite clouds (GOES regional or global infrared, Clouds only or Full image) and Lightning density (Americas and Pacific) on one history timeline                                                                                                                                                                                                     | NOAA nowCOAST                           | 🟢                                                                                                  |
| 🌀 **Cyclones**             | Advisory positions, forecast tracks and uncertainty cones for the Atlantic and eastern/central North Pacific                                                                                                                                                                                                                                                                        | NOAA NHC / CPHC                         | 🟢                                                                                                  |

**Weather, keyless.** **Wind** animates 10 m forecast flow from NOAA GFS or ECMWF IFS, with an optional color field and a reading at map center. **Rain radar**, **Satellite clouds** and **Lightning density** are observations on one history timeline in the **WEATHER** panel (step back, **Play**, **Latest**); **Cyclone advisories** draw NHC and CPHC positions, forecast tracks and cones. On Google 3D Tiles the observed layers float above the city as translucent shells, sharpened around your view.

In the app, **Data Layers** groups them as Movement, Cameras, Infrastructure, Events, Weather and Utilities.

**The basemap ladder — what each tier buys you:**

| You have                   | The globe you get                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟢 Nothing                 | Esri World Imagery satellite basemap + keyless terrain, in 2D. OSM takes over automatically if Esri is unreachable; if terrain is unavailable the globe continues without it |
| 🟡 A free Cesium ion token | **Google Photorealistic 3D cities** and world terrain — eligible personal, non-commercial use; current ion terms and quotas apply                                            |
| 🔴 A Google Maps key       | The same 3D direct from Google, plus Google place search — the billing-enabled, metered route                                                                                |

![A reconstructed Falcon 9 ascent climbing and curving into its projected orbit](docs/media/08-falcon9-replay.gif)

_The Space Missions layer replaying a Falcon 9 ascent — labeled `RECONSTRUCTED ESTIMATE`, scrubbable 0.25×–4×._

**Also on the globe:** neighborhood overlays · an optional cockpit WX cloud effect. **Bundled static infrastructure:** Datacenters (4,351), Dams (704), and Submarine Cables (712).

![Diving into the Bahamas and revealing labeled submarine cable routes beneath the globe](docs/media/09-undersea-cables.gif)

**Missing a layer you want?** Open an issue — or add it and send the PR.

---

## 📷 Street Level

> Street-level photos from any provider in one panel. This build ships **Mapillary**, which needs a free client token.

**Setup.** At [mapillary.com/dashboard/developers](https://www.mapillary.com/dashboard/developers), register an application with **Read** access and copy its **Client Token** (`MLY|…`). Paste it into **POWER UP → Mapillary**, or set `MAPILLARY_CLIENT_TOKEN` in `.env` and restart. Without it the panel reads **KEY REQUIRED**.

**Use.** Turn on **Street Level** under DATA LAYERS → Cameras, or with the pill in the STREET LEVEL panel header. Each provider has a chip in its own colour (Mapillary green). The **IMAGERY** (ALL / 360° / FLAT) and **SINCE** filters apply to every provider. Click a coverage line for its image cones and a cone to open the photo. Above the photo: **EXPAND**, **FIT / FILL**, and **FOLLOW** (the globe camera follows the photo's view; Google 3D map only). The caption links to the image on the provider's site, and the globe credits "© Mapillary contributors, CC BY-SA 4.0" while Mapillary is on.

Drag the panel header to float the panel, and resize it from any edge. Double-click the header or collapse it to put it back in the rail. Share links carry the provider switches and filters (`0.m.0` Mapillary off, `0.p.p` panoramas only, `0.s.365` the last year). To add a provider, implement the contract in `src/layers/streetLevel/registry.js` and register it in `src/app/layers/streetLevel.js`.

## 🎖️ Field Missions

Once the basics click, run these:

| Mission                             | How                                                                                                                                                                                                       |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🚁 Ask the planet**               | _"Why are all these military helicopters flying in circles?"_ Select a military track — it silently backfills ~24 h of real trace history — and see what it's been doing, resolved as stacked 3D loops.   |
| **✈️ Final approach**               | Click-track an airliner lining up for a runway, hop into the **cockpit**, and ride it down.                                                                                                               |
| **🌃 Night watch**                  | Fly to your own city, switch to **NVG**, and let the detection mesh and HUD read the scene.                                                                                                               |
| **🚢 Port call**                    | Vessels on over the Port of Long Beach. Click a tanker for its tactical card and wake trail — then hit **NEAREST** in the CCTV panel and look at the same water through a public camera.                  |
| **📻 Tokyo FM**                     | Orbit Shibuya with the **Radio** layer on — then drag the analog tuner needle: every position snaps to a real station and the globe flies to whoever's broadcasting.                                      |
| **🔥 Fire line**                    | FIRMS over California. Click a detection — the camera dives to it — read the intensity, then hit **NEAREST** in the CCTV panel for a ground view.                                                         |
| **🚶 Ask for a walking route** _🎙️_ | Tell the world where you want to go and watch a real street-following route trace itself through the 3D city — then _"fly it"_: banked turns, eased ends, a camera that leads the path like a drone shot. |
| **📏 Measure LAX to DFW** _🎙️_      | _"How far is LAX from DFW?"_ — an arrow spans the country, the distance lands in the caption, and the endpoints stay pinned to the real world as you orbit.                                               |
| **🚀 Launch replay**                | Open **Space Missions**, pick a launch from the last 30 days, and ride the T-minus countdown through ascent to orbit — scrub it at 0.25×–4×. Labeled `RECONSTRUCTED ESTIMATE`, because it is one.         |
| **🪦 Walk the boneyard**            | Fly from regional context down into dense, fully resolved rows of retired aircraft.                                                                                                                       |
| **🏗️ Orbit Three Gorges**           | Sweep the dam and its terrain at a glance — then flip on the **Dams** layer and find 703 more.                                                                                                            |

_🎙️ = voice missions — they need an OpenAI key._

![Resolving a selected aircraft's recent flight path into stacked 3D loops above the terrain](docs/media/07-helicopter-loops.gif)

_Ask the planet: a military contact's last ~24 hours of real trace history, resolved as stacked 3D loops._

![Asking for a walking route and flying the generated path through the 3D city](docs/media/10-walking-route-flythrough.gif)

_"Draw the walking route… now fly it" — banked turns, eased ends, the camera leading the path like a drone shot._

![Descending from regional context into dense rows of retired aircraft at the boneyard](docs/media/08-boneyard.gif)

_Walk the boneyard: rows of retired airframes, fully resolved in 3D._

---

## 🔧 Under the Hood

How the globe handles live data:

- **World-stable icons.** Aircraft and ships point along their _true real-world heading_ at every camera angle — tracked or not, looking straight down or across the horizon — via per-frame screen-space course projection. No spinning, no viewport-locking.
- **Smooth motion from choppy data.** Live feeds arrive every 15–30s; the globe renders one interval behind real time and interpolates between known fixes. Dead reckoning fills the gaps.
- **Honest satellites.** SGP4 propagation with orbit rings that stay locked to their satellites via GMST realignment — no drift, no per-second flicker.
- **Sits on the real ground.** Entity heights are aligned to work with Google 3D tiles, so aircraft park on aprons and cameras stand on street corners instead of floating.
- **Caching and request budgets.** An OpenSky credit governor, a TomTom daily tile budget, and disk-cached TLEs reduce repeated requests. These controls do not replace provider quotas or billing controls.
- **Server-side credentials.** Every API that touches a private key (OpenAI, AISStream, OpenSky OAuth, camera frames) is brokered through a hardened server-side proxy with SSRF protection, response caps, and sanitized errors. The only keys the browser sees are Google Maps and Cesium ion (restrict both at the provider).
- **No framework.** Vanilla JavaScript, **CesiumJS**, and **Vite** — plus **Google Photorealistic 3D Tiles** for the planet and the **OpenAI Realtime API** for voice. Fast to read, fast to hack on.

```
src/
├── main.js                 # Bootstrap: Google 3D tiles, layer registration
├── ui.js                   # Runtime UI — panels, HUD, styles, control facade
├── hud.js                  # Intelligence HUD + AI scene summary
├── keySetup.js             # POWER UP panel — in-app provider keys (dev server only)
├── mapStackController.js   # Basemap switching — Google 3D / Esri / OSM / ion stacks
├── voice/                  # OpenAI Realtime session + 30 voice tools
├── layers/                 # Layer components — weather, wind, cyclones, transit, ALPR, …
├── data/                   # One module per layer + orchestration + context store
│   ├── iconOrientation.js  # Screen-projected headings + horizon cull
│   └── local_data/         # Bundled datasets (per-folder provenance)
└── scenes/                 # Cinematic scene director
```

See [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md) for the authoritative runtime reference.

---

## 🔑 API Keys

🟢 **No key** · 🟡 **Free key** · 🔴 **Metered**

Use **POWER UP → Provider Settings** to add keys. The tables below explain what
each provider enables; none is required to start. See the
[setup instructions](#then-power-it-up--in-the-app-not-in-a-file) for storage
and configuration details.

No key needed for Wind, Rain radar, Satellite clouds, Lightning density,
Cyclone advisories, Mapped ALPR Cameras, Transit, Directions, Delaware live
video, and coordinate or bundled-place search. A layer row waiting on a key
names it.

### Choose the capabilities you want

Seven keys. Five have a free tier, and the two 🔴 ones are metered:

|     | Key             | Why                                                                                                                                                                                  | Get it                                                                                                                                                               |
| --- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🟡  | **Cesium ion**  | 🗺️ Google Photorealistic 3D, world terrain, and additional ion-hosted imagery stacks. The free Community plan is for eligible individual, personal/non-commercial use and has quotas | [cesium.com/ion](https://cesium.com/ion) — use a public `assets:read` token and check current [pricing/eligibility](https://cesium.com/platform/cesium-ion/pricing/) |
| 🔴  | **Google Maps** | Direct Google Photorealistic 3D + Google place search ([Map Tiles API](https://developers.google.com/maps/documentation/tile))                                                       | [Google Cloud Console](https://console.cloud.google.com/) — URL-restrict it                                                                                          |
| 🔴  | **OpenAI**      | 🎙️ Voice + AI HUD summary through an API key. Provider Settings also offers **USE CHATGPT OAUTH** for cloud voice without removing the API-key option                              | [platform.openai.com](https://platform.openai.com) — API-key usage is metered, see costs below                                                                       |
| 🟡  | **AISStream**   | 🚢 Live global ships                                                                                                                                                                 | [aisstream.io](https://aisstream.io) — free signup                                                                                                                   |
| 🟡  | **NASA FIRMS**  | 🔥 Live active fires                                                                                                                                                                 | [firms.modaps.eosdis.nasa.gov](https://firms.modaps.eosdis.nasa.gov/api/map_key/) — free                                                                             |
| 🟡  | **TomTom**      | 🚦 Live flow speeds and congestion colors for the simulated traffic layer                                                                                                            | [my.tomtom.com](https://my.tomtom.com/keys) — free tier available                                                                                                    |
| 🟡  | **Mapillary**   | 📷 Street Level coverage and photos. A public client token by design (see SECURITY.md)                                                                                               | [mapillary.com/dashboard/developers](https://www.mapillary.com/dashboard/developers) — register an app, copy its Client Token                                        |

![Diving from city-scale live congestion straight into an intersection's public camera](docs/media/05-traffic-to-cctv.gif)

_What the TomTom key buys you: rush-hour density painted on the city — then dive from the jam straight into the camera watching it._

### Cherry on top

|     | Key                  | Why                                                           | Get it                                             |
| --- | -------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| 🟡  | **OpenSky**          | ✈️ More flight-polling credits (🟢 anonymous works without)   | [opensky-network.org](https://opensky-network.org) |
| 🟡  | **Launch Library 2** | 🚀 Higher space-missions request allowance (🟢 works without) | [thespacedevs.com](https://thespacedevs.com)       |

Add these if you need higher polling allowances.

`npm run doctor` reports Node/npm readiness, the primary provider routes, and
where each configured provider was found without printing credential values.
On macOS its Keychain-aware result previews `./scripts/dev-fresh.sh`; plain
`npm run dev` reads only explicit environment and Vite dotenv values. The
OpenSky summary reports keyless anonymous access for explicit `anon` or an
OAuth mode without a client pair, retains presence-only wording for a complete
OAuth pair, and identifies selected Basic or auto mode without guessing which
credentials runtime will accept. Basic and credentials-file modes remain
advanced `dev-fresh.sh` configuration.

<details>
<summary>Advanced setup: environment variables and macOS Keychain</summary>

For headless machines, coding agents, or scripted setups:

```bash
# Put keys in .env (see .env.example), or pass them as env vars:
OPENAI_API_KEY="…" AISSTREAM_API_KEY="…" npm run dev -- --host localhost --port 4173

# On macOS, store any of them in the Keychain and dev-fresh.sh pulls them in:
security add-generic-password -U -s "google-maps-api" -a "api-key" -w
security add-generic-password -U -s "openai-api"      -a "api-key" -w
security add-generic-password -U -s "aisstream-api"   -a "api-key" -w
security add-generic-password -U -s "firms-map"       -a "map-key" -w
security add-generic-password -U -s "cesium-ion"      -a "token"   -w
```

OpenSky can run fully anonymous (`OPENSKY_AUTH_MODE=anon`), or import OAuth credentials with `./scripts/opensky-import-client.sh /path/to/credentials.json`.

</details>

<details>
<summary>Amateur radio preview (worldwide directories, local APRS)</summary>

Enable **Amateur Radio Preview** under **DATA LAYERS → Utilities** and explore
the globe. Amber markers are BrandMeister repeaters/hotspots; blue markers
are EchoLink RF links. Both directories cover the world; green APRS positions
remain limited to 100 km around Manchester.
Click a marker for its callsign, node ID, listed frequencies and directory age.
The row also offers **Listen latest**, **Last Heard**, and **EchoLink Web** buttons.

Directories are keyless. The default BrandMeister view shows only devices with a valid directory
last-seen timestamp in the preceding 60 minutes (UTC), not necessarily currently
connected or transmitting. Unknown, invalid and future timestamps are excluded.
Use the **BrandMeister: 60 min** chip beneath **Amateur Radio** to toggle between
the **60-minute directory view** and **5 min live** view. The live view uses
public Last Heard call events, matching both the repeater/hotspot node ID
(`ContextID`, repeater link type) and node callsign against directory locations.
Unknown nodes, bridges, mismatches, private and flagged traffic are omitted;
caller IDs and talkgroup areas are never used to guess a transmitter location.
A node can appear in live mode even when its directory last-seen timestamp is old.
Switching back restores eligible hourly directory dots without another fetch;
EchoLink, APRS and playing audio are unchanged. The choice survives switching
the layer off and on, but resets to 60 minutes when the page reloads.
While the layer is enabled, a shared metadata-only Last Heard connection builds
the observed history; the map polls it roughly every 10 seconds and expires
nodes five minutes after their last observed activity. Collection starts on
demand, so complete five-minute backfill is not promised. The row shows connection
status, collection start time, no-match explanations and errors; an unavailable
live feed never falls back to older directory dots. Disabling the layer stops
browser polling; server collection leases expire after 30 seconds without map
requests, and the shared socket closes after 90 seconds without any requests.
This does not open audio or retune the player.
The cutoff is rechecked on cached responses and markers expire independently
of network refreshes, so an outage cannot keep an older device visible.
EchoLink lists online links in a snapshot
updated by the provider approximately every three minutes. Coordinates are
owner-supplied and unverified. Directory markers do not indicate RF coverage,
operator GPS positions, or ongoing voice activity (a live-mode dot may represent
a call that has already ended). Failed feeds are explicitly marked;
cached records are labelled stale and retained for no more than an hour.

**Live activity and audio:** **Listen latest** opens a compact bottom-edge
BrandMeister dock and preselects one talkgroup from public activity.
**Clicked markers first consult a curated intended-area directory:** matching
local groups, then matching regional groups, then the existing country rules.
The initial **84 entries** cover London, selected Canadian cities, UK regions,
all US states/DC, Canadian provinces/territories and selected French areas.
This is a seed directory, not exhaustive worldwide coverage.

Local matching uses the approved **25 km city-centre proximity rule**;
regional matching uses bundled administrative boundaries or documented unions
of them. Both are approximations of an **intended area**, not RF coverage,
repeater catchment or a speaker's location. Newest activity breaks regional ties;
overlapping local matches prefer the nearest city centre. Country fallback
does not mistake known out-of-area groups for nationwide groups when an
otherwise equal alternative is available.

Use **Show player → Intended-area directory** to search by area, TG or country
code and inspect official source links and review dates. City points link to
their CC0 Wikidata records. Source review dates are not live verification.
The selected group's intended-area match and source are also shown in the dock.
No live geocoding or guesses from talkgroup names are used.

**Without a matching intended area**, a BrandMeister marker outside the UK
prefers the currently transmitting
talkgroup whose associated country is nearest that marker: the marker's own
country first, then the next nearest available country. Distance is to bundled
country boundaries, not a capital or the map centre; newest activity breaks ties.
The dock retains that marker for subsequent **Listen latest** actions.
UK markers without an area match and actions without a selected marker retain
UK (234/235 prefixes), English-priority, then other groups.
If no groups are transmitting, the same ranking uses calls ended within three
minutes; these may now be silent. Country associations use three-digit MCC
prefixes and are best effort, not a talker's location. Shared prefixes use the
nearest associated country; worldwide/unassigned groups follow mapped countries
(or use newest activity if none are mapped). English priority is TGs
91/93/95/913/3100 or a name containing "English", not speech detection.
This does not connect to the clicked repeater or imply local RF reception.
Use **Show player** and press Play inside Hoseline if the browser requires it.
**Minimise to dock** keeps the same client and audio running while exposing
the map. **Listen latest** retunes only when explicitly pressed; it does not
continuously interrupt a conversation. **Choose manually** remains available.
If navigation stalls for 30 seconds or fails, **Player failed: retry** reloads
the same selected talkgroup; manual selection can also replace a failed player.
If the player stays blank in VS Code's integrated browser, open the app in a
regular Chrome or Edge window; this resolved the observed embedded-client stall.
Alternatively use **Stop embed / open official site**. Frame navigation is not
proof of audio.
Activity errors are shown rather than silently selecting a default talkgroup.
EchoLink opens an in-app panel but does not load its client until you acknowledge
that other clients using your callsign are logged out and closed. It requires a
validated single-user account; login and select one node manually. Embedded
microphone/camera access is denied. Connections can announce your presence;
incoming connections remain controlled by EchoLink settings. Closing the panel,
switching clients or disabling the layer unloads the embedded player; minimising
BrandMeister does not. Last Heard
and a fallback button open official sites externally; external sites have their
own microphone permissions. Credentials stay with the official cross-origin
services; the app does not collect them or relay audio.

**Published positions:** set `APRS_IS_CALLSIGN=YOURCALL-GV` in your ignored
`.env` and restart the server. This must be your own unique APRS-IS identifier.
The local server uses only `pass -1` (receive-only), with a fixed Manchester
100 km filter. Green markers are last published APRS station fixes, refreshed
every ten seconds; not every station is mobile, a person, or a GPS receiver.
Cards distinguish receipt time from supplied UTC report time and show source
provenance and ambiguity. Standard, compressed and unambiguous Mic-E station
positions are decoded. Weather stations are identified; objects, messages,
comments and do-not-archive reports are not retained. At most 1,000 fixes are
held in memory for 15 minutes, with no disk history. The shared receiver stops
after 30 seconds without position polling and reconnects with bounded backoff.
Connection errors and unconfigured status are visible, never replaced by fake
positions. BrandMeister radios appear only when they publish compatible APRS
reports; EchoLink has no moving operator-location source in this preview.
Selecting markers never transmits or automatically connects to a radio node.

Sources: [BrandMeister API](https://api.brandmeister.network/docs/),
[EchoLink geographic feed](https://www.echolink.org/googleInfo.htm),
and [EchoLink Web FAQ](https://www.echolink.org/faq_webapp.htm).
Position transport: [APRS-IS](https://www.aprs-is.net/Connecting.aspx).

</details>

<details>
<summary>Live video cameras (HLS)</summary>

CCTV sources with `"feedType": "hls"` and a registered HTTP(S) `.m3u8`
URL play through a lazily loaded hls.js decoder shared by the monitor plane
and panel. DelDOT uses its official HTTPS HLS catalog links. Disable that
pack with `CCTV_DELDOT_ENABLED=0`.

The server allows two concurrent sessions. Each retains at most 12 segments
and 24 MiB in memory; individual downloads are capped at 4 MiB with a ten
second deadline. There are no segment files or ffmpeg processes. Redirects,
off-origin references, encrypted playlists and non-MPEG-TS segments are refused.
Each decoder has its own client lease (at most eight per session), including
native HLS. Closing it releases only that lease; abandoned leases expire after
15 seconds without access. The last release stops upstream work. Failed live video
uses the existing still/Street View/synthetic fallback, which is not live video.
RTMP-only sources are not supported by this integration.

</details>

### 💸 What it actually costs

Honest numbers, roughly, as of mid-2026 — always check the provider pricing pages:

|                          | Cost reality                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **🟢 Most layers**       | **$0, no signup.** OpenSky anon, USGS, CelesTrak, adsb.lol, city CCTV, Radio Browser, GBFS, Launch Library 2, transit feeds, OSRM routing, NOAA and ECMWF weather, OpenStreetMap ALPR mapping, bundled datasets.                                                                                                                                                            |
| **🟡 The free-key tier** | **$0 with a signup.** AISStream, FIRMS, TomTom, OpenSky, plus Cesium ion for eligible personal/non-commercial use. Provider quotas and eligibility still apply.                                                                                                                                                                                                             |
| **🗺️ Google 3D tiles**   | **Free through an eligible Cesium ion Community account within its quota; metered through a direct Google key.** Use the direct route for Google place search or commercial deployment, verify current provider terms, and set budget alerts where billing is enabled.                                                                                                      |
| **🔴 OpenAI voice**      | API-key sessions keep the live spend readout, STD/MINI model toggle, $2 warning, and **$5 hard cap**. ChatGPT OAuth is an explicit choice in Provider Settings. Its usage is tracked without an API-dollar estimate or spend cap. The voice context window stays deliberately short. |

Google's direct 3D route is surprisingly generous: the first 1,000 Photorealistic
3D Tiles sessions each month are currently free, and one root request supports
roughly three hours of rendering. A solo user exploring sparingly can
realistically stay inside the free usage cap. Billing must still be enabled, so
restrict the key and set a quota or budget alert. Check Google's
[current pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
before relying on these figures.

### 🧗 The floor is low on purpose

Everything above is the deliberately cheap baseline — enough to get a real taste of geospatial intelligence, GEOINT, and OSINT without ever talking to a sales team. You'll also notice the ceiling: terrestrial AIS goes quiet mid-ocean and satellite AIS costs real money; premium imagery, SAR, and the deeper commercial feeds live behind enterprise contracts. That's not a limit of the architecture — every layer here is a pattern you can point at your own data sources. This repo hands you the foundation; what you fuse into it is up to you.

### 🔒 Sharing an instance

By default nobody else can reach your server — it binds to localhost. To share on your LAN, opt in explicitly (`npm run dev -- --host 0.0.0.0 --port 4173`, or `HOST=0.0.0.0 ./scripts/dev-fresh.sh` on macOS/Linux). IP addresses work as they are; if you use a LAN hostname, add it with `GEV_ALLOWED_HOSTS=globe.lan`, since binding to `0.0.0.0` does not trust arbitrary Host headers. But know that ⚠️ **a LAN-visible server brokers your configured API keys to anyone who can reach it.** Per-IP throttles on the cost-bearing endpoints are on by default (`GEV_RATELIMIT_OPENAI_PER_MIN`, `GEV_RATELIMIT_GOOGLE_PER_MIN` — see `.env.example` to tune them), but before anything else, **configure provider quotas, usage limits, and billing alerts**: app-level throttles are not billing caps, and a budget alert alone does not stop spending. Full threat model in [SECURITY.md](SECURITY.md).

Provider Settings is disabled when the server is shared, so remote users cannot
access the key-entry panel.

**Pinokio LAN and Cloudflare sharing remain disabled for this launcher.** Use
a separately reviewed authentication proxy if remote access is required.
[SECURITY.md](SECURITY.md) explains the restrictions and threat model.

---

## 📋 Responsible & Open

God's Eye View runs on **public data, clear sources, and local-first execution.** No secrets, no private datasets, no mystery scraping — anything involving a private key is brokered server-side. It has the visual grammar of a classified ops room, built entirely from open signals and inspectable code.

**The line.** This project models **events, assets, infrastructure, and systems** — aircraft, vessels, satellites, fires, cameras, cities. It does not build features for named-person search, face recognition, or tracking individuals, and pull requests that cross that line won't be merged. People are not a query type here.

**Come build it.** This is the canonical live 3D client from the project that kicked off the recent wave of spatial-intelligence tools — and it's a canvas: the layers here are the signals one person could find and fuse. Add a city pack, a data source, a style, a voice tool. It's the window through which you see the world; bring that window to others.

**Status:** An evolving open-source client for exploration and learning — a fast, hackable foundation, not a hardened production service. Released under the **[MIT License](LICENSE)**. Bundled and live datasets carry their own terms — see **[DATA_SOURCES.md](DATA_SOURCES.md)**. Security model: **[SECURITY.md](SECURITY.md)**. Want to contribute? **[CONTRIBUTING.md](CONTRIBUTING.md)**.

**Maintainers:** [Bilawal Sidhu](https://github.com/bilawalsidhu) and [Sameh Khamis](https://github.com/samehkhamis) at [Halfpixel](https://halfpixel.ai).

<sub>Media note: the capture GIFs on this page show Google Photorealistic 3D Tiles and live data layers, used promotionally with in-frame attribution; they aren't licensed for standalone reuse. See [media provenance and permissions](docs/media/README.md); full source terms in [DATA_SOURCES.md](DATA_SOURCES.md).</sub>

> [!IMPORTANT]
> God's Eye View is an exploratory visualization of public and third-party data.
> Data may be delayed, incomplete, modeled, inferred, or wrong. Do not use it
> for flight or maritime navigation, emergency response, medical or health
> decisions, investment decisions, or other safety-critical or operational
> purposes. Verify important information with authoritative sources.

---

## 🧭 What's Next

First — thank you. To everyone who watched the God-view demos and went off to build their own, and to everyone who kept asking for the code: I'm grateful. And when I polled whether this should go open source, you weren't subtle about it:

<img src="docs/media/open-source-survey.png" alt="Community survey on open-sourcing God's Eye View" width="460">

So here it is. Step inside the spy-thriller cockpit — except the data is real — and let's turn this into our shared sandbox for making sense of the world, and have fun doing it. This repo is the baseline, it stays open, and the whole point is for you to break things and bolt on layers we haven't thought of yet.

One heads-up from the inside: build in this space for a week and you learn that **the present is the cheap part**. The moment you try to go back in time — tiling, serving, and scrubbing _what happened_ and _what changed_ at any real resolution — the data gets expensive and the compute gets brutal. That's the long game.

**Update — a hosted version is coming.** We originally planned to keep this repository as the open-source client and build a separate professional product. Then the launch happened, and the loudest request wasn't another feature — it was _"just give me a link."_ So we're building an official hosted God's Eye View at [Halfpixel](https://halfpixel.ai): no installation, just open it in your browser. The hosted version is the easiest way into this open-source project. More soon.

---

<div align="center">

▶️ [Watch the God's Eye View series](https://youtube.com/playlist?list=PL6qSg2I-7_koPbDnSMo0QeeHX_RknA2uv&si=nBGYMoHWQw41v93Q) · 📬 [Map the World](https://maptheworld.ai/) — the newsletter behind the project

**🌐 God's Eye View. No place left behind.**

</div>
