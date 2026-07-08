import os
import warnings
import hashlib
import time
from collections import defaultdict
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile, File, Request
from fastapi.responses import JSONResponse

# Suppress IBM Watsonx deprecation warnings for the restricted zone model
warnings.filterwarnings("ignore", module="ibm_watsonx_ai")
warnings.filterwarnings("ignore", category=UserWarning)
import fitz  # PyMuPDF
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic import BaseModel, field_validator
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

import chromadb
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import SentenceTransformerEmbeddings

chroma_client = chromadb.Client()
collection = chroma_client.get_or_create_collection(name="financial_reports")

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------
load_dotenv()

# [H5] Disable Swagger/ReDoc in production — the API surface should not be exposed
app = FastAPI(
    title="FinForensic AI Engine",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# ---------------------------------------------------------------------------
# [M4] Security Headers Middleware
# ---------------------------------------------------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject hardened HTTP security headers into every response."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        return response

app.add_middleware(SecurityHeadersMiddleware)

# ---------------------------------------------------------------------------
# [H2] Rate Limiting Middleware
# ---------------------------------------------------------------------------
class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple in-memory rate limiter.
    - /api/chat/analyze: 10 requests per minute per IP (protects Watsonx API quota)
    - All other endpoints: 60 requests per minute per IP
    """
    def __init__(self, app):
        super().__init__(app)
        self._requests: dict[str, list[float]] = defaultdict(list)
    
    async def dispatch(self, request: Request, call_next):
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path
        now = time.time()
        
        # Determine rate limit based on endpoint
        if "/api/chat/analyze" in path:
            limit, window = 10, 60  # 10 req/min for AI endpoints
        elif "/api/upload-report" in path:
            limit, window = 5, 60   # 5 req/min for file uploads
        else:
            limit, window = 60, 60  # 60 req/min for everything else
        
        key = f"{client_ip}:{path}"
        # Prune old entries outside the window
        self._requests[key] = [t for t in self._requests[key] if now - t < window]
        
        if len(self._requests[key]) >= limit:
            return JSONResponse(
                status_code=429,
                content={"detail": "Rate limit exceeded. Please try again later."}
            )
        
        self._requests[key].append(now)
        return await call_next(request)

app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# ---------------------------------------------------------------------------
# [H3] Pydantic models with input length validation
# ---------------------------------------------------------------------------

# Maximum upload file size: 10 MB
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024

class FinancialData(BaseModel):
    working_capital: float
    retained_earnings: float
    ebit: float
    market_cap: float
    total_liabilities: float
    sales: float
    total_assets: float


class ChatRequest(BaseModel):
    user_prompt: str
    company_context: str
    custom_mandates: str | None = None

    @field_validator("user_prompt")
    @classmethod
    def validate_user_prompt(cls, v: str) -> str:
        if len(v) > 2000:
            raise ValueError("user_prompt must not exceed 2000 characters.")
        return v

    @field_validator("company_context")
    @classmethod
    def validate_company_context(cls, v: str) -> str:
        if len(v) > 50000:
            raise ValueError("company_context must not exceed 50,000 characters.")
        return v

    @field_validator("custom_mandates")
    @classmethod
    def validate_custom_mandates(cls, v: str | None) -> str | None:
        if v is not None and len(v) > 5000:
            raise ValueError("custom_mandates must not exceed 5,000 characters.")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_divide(numerator: float, denominator: float, label: str) -> float:
    """Return numerator / denominator or raise a 422 if denominator is zero."""
    if denominator == 0.0:
        raise HTTPException(
            status_code=422,
            detail=f"Division by zero: '{label}' denominator is zero.",
        )
    return numerator / denominator


def _z_score_risk_status(z: float) -> str:
    if z > 2.99:
        return "Safe Zone"
    if z >= 1.81:
        return "Grey Zone"
    return "Distress Zone"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/audit/z-score")
def calculate_z_score(data: FinancialData):
    """
    Compute the Altman Z-Score from the supplied financial figures.

    Z = 1.2·X1 + 1.4·X2 + 3.3·X3 + 0.6·X4 + 0.999·X5
    """
    x1 = _safe_divide(data.working_capital,    data.total_assets,      "Working Capital / Total Assets")
    x2 = _safe_divide(data.retained_earnings,  data.total_assets,      "Retained Earnings / Total Assets")
    x3 = _safe_divide(data.ebit,               data.total_assets,      "EBIT / Total Assets")
    x4 = _safe_divide(data.market_cap,         data.total_liabilities, "Market Cap / Total Liabilities")
    x5 = _safe_divide(data.sales,              data.total_assets,      "Sales / Total Assets")

    z = (1.2 * x1) + (1.4 * x2) + (3.3 * x3) + (0.6 * x4) + (0.999 * x5)

    return {
        "z_score": round(z, 4),
        "risk_status": _z_score_risk_status(z),
        "ratios": {
            "X1_working_capital_to_total_assets":   round(x1, 6),
            "X2_retained_earnings_to_total_assets": round(x2, 6),
            "X3_ebit_to_total_assets":              round(x3, 6),
            "X4_market_cap_to_total_liabilities":   round(x4, 6),
            "X5_sales_to_total_assets":             round(x5, 6),
        },
    }


from fastapi.responses import StreamingResponse
import asyncio
import json
from agents import summarize_document, run_quant_analysis, run_compliance_analysis, run_macro_analysis, synthesize_verdict

@app.post("/api/chat/analyze")
async def analyze_with_watsonx(request: ChatRequest):
    """
    Stream a forensic analysis using the Antigravity Map-Reduce Swarm (SSE).
    Provides progressive disclosure for the Terminal-Grade UI.
    """
    async def event_generator():
        try:
            # 1. Summarization Agent (Token Optimization)
            yield f"data: {json.dumps({'agent': 'system', 'status': 'Ingesting and summarizing context...'})}\n\n"
            summary, sum_tokens = await summarize_document(request.company_context)
            yield f"data: {json.dumps({'agent': 'summarization', 'content': summary, 'tokens': sum_tokens})}\n\n"

            # 2. Map Phase (Parallel Agents)
            yield f"data: {json.dumps({'agent': 'system', 'status': 'Launching Quant, Compliance, and Macro swarms...'})}\n\n"
            
            # Using asyncio to run them concurrently
            # Querying ChromaDB for Context
            quant_query = collection.query(query_texts=["Financial performance, revenue, EBITDA, growth, margins"], n_results=3)
            quant_context = "\n".join(quant_query['documents'][0]) if quant_query['documents'] else ""
            
            comp_query = collection.query(query_texts=["Regulatory risks, SEC, litigation, debt, compliance penalties"], n_results=3)
            comp_context = "\n".join(comp_query['documents'][0]) if comp_query['documents'] else ""
            
            macro_query = collection.query(query_texts=["Market conditions, competitors, geopolitical impact, supply chain, macroeconomic shock"], n_results=3)
            macro_context = "\n".join(macro_query['documents'][0]) if macro_query['documents'] else ""
            
            task_quant = asyncio.create_task(run_quant_analysis(summary, f"{request.company_context}\n\nDocument Context:\n{quant_context}"))
            task_compliance = asyncio.create_task(run_compliance_analysis(summary, f"{request.company_context}\n\nDocument Context:\n{comp_context}", request.custom_mandates))
            task_macro = asyncio.create_task(run_macro_analysis(summary, f"{request.company_context}\n\nDocument Context:\n{macro_context}"))

            async def wrap(task, name):
                res = await task
                return name, res

            # Progressive disclosure as they complete
            wrapped_tasks = [
                wrap(task_quant, "quant"),
                wrap(task_compliance, "compliance"),
                wrap(task_macro, "macro")
            ]
            
            reports = {"quant": "", "compliance": "", "macro": ""}
            for coro in asyncio.as_completed(wrapped_tasks):
                agent_type, result = await coro
                content, tokens = result
                reports[agent_type] = content
                yield f"data: {json.dumps({'agent': agent_type, 'content': content, 'tokens': tokens})}\n\n"

            # 3. Reduce Phase (Chairman Orchestrator)
            yield f"data: {json.dumps({'agent': 'system', 'status': 'Synthesizing Boardroom Verdict...'})}\n\n"
            verdict, ch_tokens = await synthesize_verdict(
                quant_report=reports["quant"],
                compliance_report=reports["compliance"],
                macro_report=reports["macro"]
            )
            yield f"data: {json.dumps({'agent': 'chairman', 'content': verdict, 'tokens': ch_tokens})}\n\n"
            yield f"data: {json.dumps({'agent': 'system', 'status': 'done'})}\n\n"

        except Exception as e:
            # [H1] Sanitize error — never expose raw exception details to the client
            yield f"data: {json.dumps({'agent': 'error', 'content': 'An internal error occurred during analysis. Please try again.'})}\n\n"

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


# [C2] Allowed MIME types for upload
ALLOWED_MIME_TYPES = {"application/pdf"}

@app.post("/api/upload-report")
async def upload_report(file: UploadFile = File(...)):
    """
    Accept a PDF upload, extract its plain text via PyMuPDF, and insert it into ChromaDB using LangChain text splitting.
    """
    try:
        # [C2] Validate file type
        if file.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=415,
                detail="Unsupported file type. Only PDF files are accepted.",
            )

        # [C2] Read with size limit enforcement
        pdf_bytes = await file.read()
        if len(pdf_bytes) > MAX_UPLOAD_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File too large. Maximum allowed size is {MAX_UPLOAD_SIZE_BYTES // (1024*1024)}MB.",
            )

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        raw_text = ""
        for page in doc:
            raw_text += page.get_text()

        doc.close()

        splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
        chunks = splitter.split_text(raw_text)

        if chunks:
            # [H4] Prefix chunk IDs with a filename hash to prevent cross-document collisions
            filename_safe = file.filename or "unknown"
            file_hash = hashlib.sha256(filename_safe.encode()).hexdigest()[:12]
            ids = [f"{file_hash}_chunk_{i}" for i in range(len(chunks))]
            collection.upsert(documents=chunks, ids=ids)

        return {"filename": file.filename, "status": "Vectorized", "total_chunks": len(chunks)}

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is (they are already sanitized)
    except Exception:
        # [H1] Never leak raw exception details to client
        raise HTTPException(
            status_code=422,
            detail="PDF extraction failed. Please ensure the file is a valid PDF document.",
        )
