# **Peripateticware: Comprehensive Canonical Technical Specification (V9)**

This document is the unified, authoritative source of truth for the Peripateticware platform. It consolidates all architectural decisions, logic specifications, and design paradigms developed during the pre-build phase. Note: While images are provided as separate high-resolution attachments (PNG), the detailed architectural flow descriptions are documented here to ensure full technical traceability.

## **1\. Executive Summary & Core Mission**

Peripateticware is a "contextual AI tutor" designed for high-precision mobile learning on the Pixel 9 Pro. It synthesizes real-world location (GPS), visual/auditory inputs, and teacher-curated curriculum (RAG) to transform environments into interactive laboratories. The system utilizes a Human-in-the-Loop (HITL) model, ensuring AI pedagogical insights are validated by educators.

## **2\. Comprehensive System Architecture**

| Component | Technology Stack | Core Responsibilities   |
| :---- | :---- | :---- |
| **Mobile Client** | Flutter (Dart) / Android SDK 35 | Multimodal sensor capture, Offline-First state management, Student Inquiry Hub UI. |
| **Network Layer** | Tailscale VPN \+ Cloudflare Tunnels | Private LAN overlay for secure Ollama access; subdomain routing for the Teacher Dashboard. |
| **Backend API** | FastAPI (Python 3.13) | Orchestration of Triple-Join logic, Policy Engine enforcement, Teacher Coaching services. |
| **AI Orchestration** | Haystack 2.x | Modular RAG pipelines, contextual routing, model-agnostic provider interfaces. |
| **Vector Storage** | PostgreSQL \+ pgvector | Storage for curriculum embeddings, Geo-pins, student assessment records. |
| **Inference Engine** | Ollama (Llama 3, Llava, Whisper) | Private, local processing of text, vision identification, and audio transcription. |

## **3\. Architecture Diagrams & Flow Descriptions**

### **3.1 System-Level Architecture Flow**

* **The Edge (Pixel 9 Pro):** Acts as the primary sensor hub. Captures GPS, images, and audio; manages local state through an offline-first cache.  
* **The Mesh (Tailscale):** Provides a secure, encrypted tunnel between the mobile device and the remote Ubuntu host, bypassing public firewall complexities.  
* **The Core (Ubuntu Host):** Runs the primary reasoning engine (FastAPI \+ Haystack). Synthesizes RAG data from the vector store and executes inference via Ollama.  
* **The Gateway (Cloudflare):** Securely exposes the Teacher Dashboard and API to authenticated subdomains.

### **3.2 Service-Level Architecture Flow**

* **The Controller (FastAPI):** Manages API requests, authentication, and the Policy Engine. Routes learning requests to the orchestrator.  
* **The Orchestrator (Haystack 2.x):** Executes the Triple-Join reasoning pipeline. Fetches curriculum chunks based on site and persona.  
* **The Inference Hub (Ollama):** Service hosting local models (Llava, Llama 3, Whisper).  
* **The Observability Service:** Monitors health, running periodic "ghost probes" to ensure reasoning quality.

## **4\. The Triple-Join Reasoning Engine**

Intersection of **Site (GPS/Wiki)**, **Curriculum (Teacher RAG)**, and **Persona (Student Interests)**. This engine prevents infinite inquiry by narrowing the scope to pedagogically relevant landmarks.

## **5\. Prompt Engineering Specifications**

* **Intersection Prompt:** Synthesizes dimensions into 3 Inquiry Paths using interests as "hooks."  
* **Pedagogy Prompt:** Socratic scaffolding; hints anchored in student captures.  
* **Synthesis Prompt:** Maps notebooks to Bloom’s/Marzano taxonomies and State Standards.  
* **Collaborative Planning Prompt:** Generates discovery suggestions in the Inquiry Hub.  
* **Clarification Summarizer:** Distills student queries for instructor briefing.  
* **Adaptive Assessment Prompt:** Regenerates feedback for teacher manual overrides.  
* **LMS Alignment Prompt:** Formats final data for Gradebook Passback via LTI 1.3.

## **6\. Teacher Logic & Calibration Ecosystem**

* **Logic Sandbox:** Audit AI reasoning via Attribution Map and Grounding Scores.  
* **Prompt Simulation:** "Stress-test" logic using mock payloads.  
* **Geo-pins:** Hyper-local coordinate-specific overrides for "Mandatory Facts."  
* **Standards Matrix:** Heatmap of class progress against taxonomies.

## **7\. Android Optimization Layer**

* **Hardware Capability Matrix (HCM):** Dynamic feature scaling based on NPU and camera levels.  
* **Geofence Pre-warming:** Reduces shutter lag by pre-initializing the camera stack upon geofence entry.  
* **Visual Inertial Odometry (VIO):** Mitigates GPS drift in urban canyons using accelerometer/camera flow.

## **8\. Multimodal Integration & Sync Engine**

* **Asynchronous Sync Engine:** WAL-based state machine for offline-first resilience.  
* **Media Pipeline:** Pre-processing for Vision (Llava) and Audio (Whisper), including OCR and de-reverb.  
* **Conflict Resolution:** "Teacher-Led Semantic Merge" prioritizes pedagogical refinements.

## **9\. Accessibility & Universal Design for Learning (UDL)**

* **Sensory:** Spatial audio guidance pings, haptic patterns for "logic matches."  
* **Interaction:** Hands-free voice-to-voice mode, TalkBack optimization, live captioning.  
* **Cognitive:** Multiple representations and adaptive scaffolding complexity.

## **10\. Curriculum Locker & Stakeholder Portals**

* **Curriculum Locker:** Encrypted .pbundle distribution for offline sessions.  
* **Parent Portal:** Read-only artifact gallery, consent ledger, and safety alerts.

## **11\. Technical Observability & Compliance**

* **Health Dashboard:** Inference latency tracking, Ghost probes, thermal/battery monitoring.  
* **Security/Privacy:** PII Scrubbing, E2EE student-teacher threads, Regional Policy Controller (GDPR/COPPA).  
* **Data Retention:** 12-month lifecycle with automated anonymization/purging.

## **12\. Safety, Emergency & Final Roadmap**

* **Safety Broadcast:** Teacher-initiated emergency alerts to geofenced student devices.  
* **Offline Rescue:** Local navigational data access during severe connectivity loss.  
* **Pilot Criteria:** Success metrics for first site visit (latency, geofence accuracy, pedagogy).

## **13\. Revision History Ledger**

| Date | Shift | Rationale   |
| :---- | :---- | :---- |
| 2026-04-18 | Haystack 2.x | Modular multimodal routing logic. |
| 2026-04-19 | Dual-Trigger | Student choice for GPS/Vision entry. |
| 2026-04-20 | Offline-First | Resilience in historical/museum interiors. |
| 2026-04-22 | Advanced Prompts | Collaborative planning and LMS sync logic. |
| 2026-04-24 | Locker Protocol | Packaged offline spatial data distribution. |
| 2026-04-26 | **Observability & Diagrams** | Formalized health monitoring and architectural visualization. |

