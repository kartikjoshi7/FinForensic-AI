<div align="center">
  <!-- Inline SVG Logo -->
  <svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="120" height="120" rx="24" fill="#0A0A0A"/>
    <rect x="2" y="2" width="116" height="116" rx="22" stroke="url(#paint0_linear)" stroke-width="2"/>
    <path d="M60 25L85.9808 40V70L60 85L34.0192 70V40L60 25Z" fill="url(#paint1_linear)"/>
    <path d="M60 30L81.6506 42.5V67.5L60 80L38.3494 67.5V42.5L60 30Z" fill="#0A0A0A"/>
    <path d="M60 35L77.3205 45V65L60 75L42.6795 65V45L60 35Z" fill="url(#paint2_linear)"/>
    <circle cx="60" cy="55" r="5" fill="#FF3366"/>
    <defs>
      <linearGradient id="paint0_linear" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF3366"/>
        <stop offset="1" stop-color="#3366FF"/>
      </linearGradient>
      <linearGradient id="paint1_linear" x1="34" y1="25" x2="86" y2="85" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF3366"/>
        <stop offset="1" stop-color="#3366FF"/>
      </linearGradient>
      <linearGradient id="paint2_linear" x1="42" y1="35" x2="77" y2="75" gradientUnits="userSpaceOnUse">
        <stop stop-color="#FF3366"/>
        <stop offset="1" stop-color="#3366FF"/>
      </linearGradient>
    </defs>
  </svg>

  <h1 align="center">FinForensic AI — Institutional Risk & Compliance Terminal</h1>

  <p align="center">
    <img src="https://img.shields.io/badge/Angular-18-DD0031.svg?style=for-the-badge&logo=angular&logoColor=white" alt="Angular 18" />
    <img src="https://img.shields.io/badge/FastAPI-009688.svg?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI" />
    <img src="https://img.shields.io/badge/IBM_Watsonx-052FAD.svg?style=for-the-badge&logo=ibm&logoColor=white" alt="IBM Watsonx" />
    <img src="https://img.shields.io/badge/Build-Passing-brightgreen.svg?style=for-the-badge" alt="Build Passing" />
  </p>

  <p align="center">
    <strong>Live Deployment:</strong> <br>
    <a href="https://finforensic-terminal.vercel.app">https://finforensic-terminal.vercel.app</a>
  </p>
</div>

---

## Executive Summary

The global financial system requires absolute precision, yet legacy auditing processes are plagued by human latency, siloed risk modeling, and manual compliance checks. **FinForensic AI** bridges this critical gap through **deterministic AI orchestration**, transforming static financial reports into dynamic, risk-adjusted intelligence in real-time. 

Designed specifically for institutional environments, the platform relies on an **asynchronous multi-agent debate** architecture powered by IBM's latest **Granite 4** foundation model (`ibm/granite-4-h-small`). By forcing specialized AI agents (Quantitative, Compliance, and Macro) to independently analyze data and cross-validate findings under the supervision of a Chairman Orchestrator, FinForensic AI fundamentally eliminates LLM hallucinations in high-stakes financial auditing, delivering surgical, uncompromised boardroom verdicts.

---

## The Real-World Problem

In modern institutional finance, investment committees face three severe bottlenecks when auditing potential assets or trades:

1. **Information Asymmetry & Data Overload:** Corporate disclosures (10-Ks, ESG reports, earnings transcripts) span hundreds of pages. Analysts spend weeks extracting relevant data points, often missing subtle macroeconomic risks or buried compliance red flags.
2. **Cognitive Bias & Siloed Analysis:** Traditional analysis is fragmented. A quantitative analyst might approve a trade based purely on projected ROI, while remaining completely blind to a fatal regulatory compliance violation that a legal officer would catch.
3. **The "Black Box" Problem in AI:** While Generative AI is powerful, large language models (LLMs) are notorious for "hallucinating" financial figures or fabricating regulatory compliance. Institutions cannot legally or ethically deploy black-box AI that lacks a verifiable audit trail for its decisions.

---

## Unique Selling Proposition (USP)

FinForensic AI solves these exact bottlenecks through its **Deterministic Multi-Agent Swarm Framework**.

Our USP is the **Cognitive Audit Trail and Mandate Veto System**. Unlike standard ChatGPT-style wrappers that provide a single, opaque answer, FinForensic AI utilizes a *Map-Reduce* architecture where AI agents debate each other. 
If an institution injects a strict mandate (e.g., *"Must be fully compliant with GDPR"*), the Compliance Agent acts as a hard regulatory firewall. If the mandate is violated, the system triggers a **HARD VETO**, programmatically forcing the Chairman Orchestrator to deny the trade. Every decision is fully traceable back to the specific chunk of the ingested document, eliminating hallucinations and ensuring enterprise-grade accountability.

---

## The Neural Swarm Architecture

FinForensic AI is not a simple wrapper; it is a highly concurrent orchestration engine where every component serves a distinct purpose in the cognitive pipeline:

### 1. Semantic RAG (Document Ingestion)
Corporate PDFs are uploaded into the secure terminal, chunked via LangChain's `RecursiveCharacterTextSplitter`, and embedded into a localized **ChromaDB** vector memory store.

### 2. The Map Phase (Concurrent Agent Execution)
Three specialized sub-agents are executed completely asynchronously to analyze the vectorized data from unique perspectives. They are fed specific, relevant chunks to ensure grounded analysis:
- **Aggressive Quant:** Models worst-case versus expected-case scenarios, mathematically assessing downside risk, investment horizons, and ROI elasticity based on Monte Carlo simulations.
- **Compliance Officer:** A zero-tolerance regulatory watchdog that strictly cross-references corporate actions against non-negotiable institutional mandates (e.g., GDPR, ESG standards, Debt-to-Equity ratios).
- **Macro-Economist:** Synthesizes the broader market context, competitor landscapes, and historical shock impacts to assess long-term strategy viability.

### 3. The Reduce Phase (Chairman Orchestrator Synthesis)
Once all three sub-agents independently report their findings, the **Chairman Orchestrator** synthesizes the multi-dimensional analysis into a definitive, actionable **Boardroom Verdict** (Approved, Denied, or Conditional). 

---

## Core System Technologies

- **Frontend (The Terminal):** Built with **Angular 18**, leveraging **RxJS** and **Server-Sent Events (SSE)** for real-time neural stream consumption. Custom CSS Grid layouts and micro-animations deliver a premium, terminal-grade progressive disclosure experience.
- **Backend (The Orchestrator):** Engineered in **FastAPI**, it utilizes pure **asyncio** for concurrent, non-blocking agent execution. **Pydantic** enforces strict data validation schemas to guarantee pipeline integrity. Deployed continuously on **Google Cloud Run** via a customized CI/CD pipeline.
- **Cognitive Engine:** Powered by **IBM Watsonx**, running state-of-the-art Granite Foundation Models with highly tuned system instructions, dynamic prompt injection, and robust token telemetry.
- **Vector Memory:** Implements a Semantic RAG architecture using **ChromaDB** and **LangChain**.

---

## Key Platform Features

- **Asynchronous Neural Swarm:** Agents execute simultaneously in isolated context windows. This parallel processing massively reduces latency while preventing agents from anchoring to each other's biases.
- **Live Token Telemetry:** Real-time observability of Watsonx inference costs. The UI renders dynamic visual feedback, showing exact input/output token expenditure per agent, crucial for tracking enterprise operational expenditure.
- **Mandate Override Protocol:** Institutional risk rules that act as hard "vetoes" on AI decisions. 
- **Cognitive Audit Trail:** Transparent lineage mapping for all AI-generated financial insights. Every decision can be traced back to the specific agent, the exact prompt context, and the precise document chunk that influenced the outcome.

---

## Security & Compliance Posture

Engineered for the enterprise, FinForensic AI has undergone rigorous forensic security hardening:
- **Rate Limiting:** In-memory throttling via middleware protects Watsonx API quotas from DDoS or abuse.
- **Strict Validation:** Pydantic validators cap input lengths while backend handlers strictly enforce MIME-types (PDF-only) and 10MB upload limits.
- **Prompt Sanitization:** A multi-pattern regex firewall actively strips known prompt injection attacks (e.g., "ignore all previous instructions") before they reach the LLM interpolation layer.
- **Network & Data Hardening:** Features locked-down CORS policies, generic error sanitization to prevent stack trace leaks, Base64-obfuscated localStorage, and comprehensive HTTP security headers.
- **Secure Environment Management:** Complete `.gitignore` isolation ensures `WATSONX_API_KEY` and other secrets are never leaked to version control.

---

## Quickstart & Local Deployment

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Python**: v3.11 or higher (v3.12 recommended)

### Environment Variables
Create a `.env` file in the `backend` directory based on the following template (do not commit your real keys):

```env
# .env.example
WATSONX_API_KEY="your_ibm_cloud_api_key_here"
WATSONX_API_PROJECT_ID="your_watsonx_project_id_here"
WATSONX_API_URL="https://us-south.ml.cloud.ibm.com"
```

### Backend Setup
```bash
cd backend
python -m venv venv
# Activate virtual environment
# Windows: .\venv\Scripts\activate
# Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```
The terminal will be accessible at `http://localhost:4200`.

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/chat/analyze` | `POST` | Core orchestrator endpoint. Accepts JSON context and streams the asynchronous multi-agent debate back to the client via `text/event-stream`. |
| `/api/upload-report` | `POST` | Ingestion endpoint. Accepts a PDF file, chunks it via LangChain, and upserts it into the ChromaDB vector store. |
| `/api/audit/z-score` | `POST` | Quantitative endpoint. Computes the Altman Z-Score from structured financial parameters to assess bankruptcy risk. |

---

## Acknowledgments

This platform was engineered as part of the **Edunet/IBM Summer Internship program**, leveraging the power, scale, and enterprise readiness of the **IBM Cloud ecosystem** and **Watsonx Foundation Models**.
