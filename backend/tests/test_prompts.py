import pytest
import os
import sys
from dotenv import load_dotenv
import warnings

warnings.filterwarnings("ignore", module="ibm_watsonx_ai")
warnings.filterwarnings("ignore", category=UserWarning)

load_dotenv()

# Add backend directory to sys.path so we can import agents
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from agents import run_compliance_analysis, run_macro_analysis, synthesize_verdict

@pytest.fixture
def risk_scenario_text():
    fixture_path = os.path.join(os.path.dirname(__file__), 'fixtures', 'test_risk_scenario.txt')
    with open(fixture_path, 'r', encoding='utf-8') as f:
        return f.read()

@pytest.mark.asyncio
async def test_compliance_agent_catches_fraud(risk_scenario_text):
    """
    Test that the Compliance Agent flags SEC evasion and unregulated crypto.
    """
    summary = "Convene the boardroom and perform Map-Reduce analysis."
    
    # Run compliance agent
    compliance_report, _ = await run_compliance_analysis(summary_text=summary, raw_text=risk_scenario_text)
    
    # Assertions to prevent Prompt Drift
    report_lower = compliance_report.lower()
    
    assert "sec" in report_lower or "securities" in report_lower or "hard veto" in report_lower, \
        "Prompt Drift Detected! Compliance Agent missed the SEC scrutiny warning."
        
    assert "crypto" in report_lower or "unregulated" in report_lower or "offshore" in report_lower or "hard veto" in report_lower, \
        "Prompt Drift Detected! Compliance Agent missed the unregulated crypto allocation."
        
    assert "retail" in report_lower or "mislead" in report_lower or "advertise" in report_lower or "hard veto" in report_lower, \
        "Prompt Drift Detected! Compliance Agent failed to flag the misleading retail marketing."

@pytest.mark.asyncio
async def test_chairman_verdict_declines(risk_scenario_text):
    """
    Test that the Chairman Orchestrator ultimately denies the trade based on subordinate risk.
    """
    summary = "Convene the boardroom and perform Map-Reduce analysis."
    
    # Generate subordinate reports
    compliance_report, _ = await run_compliance_analysis(summary_text=summary, raw_text=risk_scenario_text)
    macro_report, _ = await run_macro_analysis(summary_text=summary, raw_text=risk_scenario_text)
    
    # Mock quant report since quant requires number crunching which isn't our focus here
    quant_report = "The quantitative metrics are highly anomalous due to hidden debt."
    
    # Generate final verdict
    verdict, _ = await synthesize_verdict(
        quant_report=quant_report, 
        compliance_report=compliance_report, 
        macro_report=macro_report
    )
    
    verdict_lower = verdict.lower()
    
    assert "deny" in verdict_lower or "denied" in verdict_lower or "decline" in verdict_lower or "reject" in verdict_lower or "not approved" in verdict_lower or "unable to approve" in verdict_lower or "cannot approve" in verdict_lower, \
        "Prompt Drift Detected! Chairman failed to decline a clearly fraudulent trade."
