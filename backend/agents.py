import json
import os
import re
import asyncio
from typing import Dict, Any
from ibm_watsonx_ai import APIClient, Credentials
from ibm_watsonx_ai.foundation_models import ModelInference
from ibm_watsonx_ai.metanames import GenTextParamsMetaNames as GenParams

# Load prompts
PROMPTS_FILE = os.path.join(os.path.dirname(__file__), "prompts.json")
with open(PROMPTS_FILE, "r") as f:
    PROMPTS_CONFIG = json.load(f)

def get_watsonx_model() -> ModelInference:
    """Instantiate and return the Watsonx ModelInference object."""
    api_key = os.getenv("WATSONX_API_KEY")
    project_id = os.getenv("WATSONX_API_PROJECT_ID")
    api_url = os.getenv("WATSONX_API_URL")

    if not all([api_key, project_id, api_url]):
        raise RuntimeError("Missing Watsonx credentials in environment variables.")

    credentials = Credentials(url=api_url, api_key=api_key)
    client = APIClient(credentials=credentials, project_id=project_id)

    return ModelInference(
        model_id="ibm/granite-8b-code-instruct",
        api_client=client,
        params={
            "max_tokens": 1024,
            "temperature": 0.2,
            "top_p": 0.9,
            "repetition_penalty": 1.1,
        }
    )

# ---------------------------------------------------------------------------
# [C3/C4] Prompt Injection Sanitization
# ---------------------------------------------------------------------------
# Known prompt injection patterns that attempt to override system instructions.
_INJECTION_PATTERNS = [
    r"(?i)ignore\s+(all\s+)?previous\s+instructions",
    r"(?i)disregard\s+(all\s+)?previous",
    r"(?i)forget\s+(everything|all|your)\s+(above|instructions|rules)",
    r"(?i)you\s+are\s+now\s+",
    r"(?i)new\s+instructions?\s*:",
    r"(?i)system\s*:\s*",
    r"(?i)assistant\s*:\s*",
    r"(?i)output\s+(the\s+)?(system|original)\s+(prompt|instructions)",
    r"(?i)reveal\s+(the\s+)?(system|hidden)\s+(prompt|instructions)",
    r"(?i)what\s+(are|is)\s+(your|the)\s+(system|original)\s+(prompt|instructions)",
    r"(?i)\[SYSTEM\]",
    r"(?i)\[INST\]",
    r"(?i)<\|system\|>",
    r"(?i)<\|im_start\|>",
]

def sanitize_user_input(text: str) -> str:
    """
    Strip known prompt injection patterns from user-supplied text.
    This prevents adversarial users from overriding the LLM system instruction
    or exfiltrating prompt templates.
    """
    if not text:
        return text
    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized)
    return sanitized


def smart_paragraph_extractor(raw_output: str) -> str:
    """
    Fallback parser to extract meaningful paragraphs if the LLM output is malformed.
    Ensures fault tolerance for the Chairman orchestrator.
    """
    if not raw_output or not raw_output.strip():
        return "Warning: Agent returned empty response. Further manual review required."
    
    # Basic fallback: strip excessive whitespace and ensure non-empty
    paragraphs = [p.strip() for p in raw_output.split('\n') if p.strip()]
    return "\n".join(paragraphs) if paragraphs else "Warning: Unparseable agent response."

async def _invoke_agent(agent_name: str, **kwargs) -> tuple[str, int]:
    """Generic async invocation of a Watsonx agent."""
    prompt_cfg = PROMPTS_CONFIG["prompts"][agent_name]
    system_instruction = prompt_cfg["system_instruction"]
    template = prompt_cfg["template"]
    
    # [C3/C4] Sanitize all user-supplied values before interpolation
    sanitized_kwargs = {}
    for key, value in kwargs.items():
        if isinstance(value, str):
            sanitized_kwargs[key] = sanitize_user_input(value)
        else:
            sanitized_kwargs[key] = value
    
    formatted_template = template.format(**sanitized_kwargs)
    
    # Also sanitize the system instruction after mandate interpolation
    # (custom_mandates is injected into the compliance system instruction)
    if "{custom_mandates}" in system_instruction:
        mandates_value = sanitized_kwargs.get("custom_mandates", "None")
        system_instruction = system_instruction.replace("{custom_mandates}", sanitize_user_input(str(mandates_value)))
    
    # Force the LLM to start with the executive summary tag to prevent refusals and formatting loss
    force_format = agent_name not in ["summarization_agent", "chairman_agent"]
    prompt_suffix = "\n\nAssistant:\n[EXECUTIVE SUMMARY]\n" if force_format else "\n\nAssistant:\n"
    full_prompt = f"System: {system_instruction}\n\nUser: {formatted_template}{prompt_suffix}"
    
    try:
        model = get_watsonx_model()
        loop = asyncio.get_event_loop()
        
        def run_call():
            if hasattr(model, 'chat'):
                try:
                    res = model.chat(messages=[{"role": "user", "content": full_prompt}])
                    if isinstance(res, dict) and "choices" in res:
                        content = res["choices"][0]["message"]["content"]
                        usage = res.get("usage", {})
                        total_tokens = usage.get("total_tokens", 0)
                        if total_tokens == 0:
                            total_tokens = usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0)
                        return content, total_tokens
                except Exception:
                    pass
            # Fallback to generation if chat fails or doesn't exist
            try:
                res = model.generate(prompt=full_prompt)
                if isinstance(res, dict) and "results" in res and len(res["results"]) > 0:
                    result = res["results"][0]
                    content = result.get("generated_text", "")
                    input_tokens = result.get("input_token_count", 0)
                    output_tokens = result.get("generated_token_count", 0)
                    return content, input_tokens + output_tokens
            except Exception:
                pass
                
            res = model.generate_text(prompt=full_prompt)
            if isinstance(res, dict) and "results" in res:
                return res["results"][0].get("generated_text", ""), 0
            return str(res), 0

        generated_response, tokens = await loop.run_in_executor(None, run_call)
        
        # Ensure the injected tag is in the final output for UI parsing
        if force_format and "[EXECUTIVE SUMMARY]" not in generated_response:
            generated_response = f"[EXECUTIVE SUMMARY]\n{generated_response}"
        
        return smart_paragraph_extractor(generated_response), tokens
    except Exception as e:
        return f"Warning: Agent '{agent_name}' encountered an internal error. Please retry.", 0

async def summarize_document(raw_text: str) -> tuple[str, int]:
    return await _invoke_agent("summarization_agent", raw_text=raw_text)

async def run_quant_analysis(summary_text: str, raw_text: str = "") -> tuple[str, int]:
    return await _invoke_agent("quant_agent", summary_text=summary_text, raw_text=raw_text)

async def run_compliance_analysis(summary_text: str, raw_text: str = "", custom_mandates: str | None = None) -> tuple[str, int]:
    return await _invoke_agent("compliance_agent", summary_text=summary_text, raw_text=raw_text, custom_mandates=custom_mandates or "None")

async def run_macro_analysis(summary_text: str, raw_text: str = "") -> tuple[str, int]:
    return await _invoke_agent("macro_agent", summary_text=summary_text, raw_text=raw_text)

async def synthesize_verdict(quant_report: str, compliance_report: str, macro_report: str) -> tuple[str, int]:
    return await _invoke_agent(
        "chairman_agent",
        quant_report=quant_report,
        compliance_report=compliance_report,
        macro_report=macro_report
    )
