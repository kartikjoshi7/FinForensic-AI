import { ChangeDetectorRef, Component, inject, OnInit } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import {
  ChartData,
  ChartOptions,
  ChartDataset,
} from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

// Raw envelope returned by the FastAPI /api/chat/analyze endpoint
interface AnalyzeResponse {
  response: string;
}


// Single message entry in the live debate transcript
interface TranscriptMessage {
  role:     string;
  text:     string;
  cssClass: string;
}

export interface StreamStatus {
  quant: 'idle' | 'loading' | 'complete';
  compliance: 'idle' | 'loading' | 'complete';
  macro: 'idle' | 'loading' | 'complete';
  chairman: 'idle' | 'loading' | 'complete';
}

// ── Strategy profiles ─────────────────────────────────────────────────────────
// Each profile defines a return premium/penalty and volatility multiplier
// relative to the user's base inputs, reflecting typical fund-category behaviour.
const STRATEGY_PROFILES: Record<string, { returnDelta: number; volMultiplier: number }> = {
  liquid_fund:  { returnDelta: -6,  volMultiplier: 0.10 },
  debt_fund:    { returnDelta: -5,  volMultiplier: 0.30 },
  multi_asset:  { returnDelta: -2,  volMultiplier: 0.50 },
  large_cap:    { returnDelta: -3,  volMultiplier: 0.70 },
  index_fund:   { returnDelta: -1,  volMultiplier: 0.90 },
  flexi_cap:    { returnDelta:  0,  volMultiplier: 1.00 },
  mid_cap:      { returnDelta: +2,  volMultiplier: 1.30 },
  small_cap:    { returnDelta: +5,  volMultiplier: 1.60 },
};

// ── Shock event definitions ───────────────────────────────────────────────────
// crashMonth: the month index (1-based) where the drawdown hits its trough
// worstDrop:  peak-to-trough drawdown applied to worst-case trajectory
// expectedDrop: drawdown applied to expected-case trajectory
// recoveryMonths: months from trough to full pre-crash level recovery
const SHOCK_PROFILES: Record<string, {
  label:          string;
  crashMonth:     number;   // relative to start; fixed at Yr 3 = month 36
  worstDrop:      number;   // fraction e.g. 0.55 → −55%
  expectedDrop:   number;
  recoveryMonths: number;
}> = {
  none:                { label: 'None',                  crashMonth: 0,  worstDrop: 0,    expectedDrop: 0,    recoveryMonths: 0  },
  oil_shock_1973:      { label: '1973 Oil Shock',        crashMonth: 36, worstDrop: 0.48, expectedDrop: 0.30, recoveryMonths: 69 },
  black_monday_1987:   { label: '1987 Black Monday',     crashMonth: 36, worstDrop: 0.33, expectedDrop: 0.22, recoveryMonths: 24 },
  dot_com_2000:        { label: '2000 Dot-Com Bubble',   crashMonth: 36, worstDrop: 0.49, expectedDrop: 0.35, recoveryMonths: 56 },
  crisis_2008:         { label: '2008 Financial Crisis', crashMonth: 36, worstDrop: 0.55, expectedDrop: 0.38, recoveryMonths: 48 },
  flash_crash_2010:    { label: '2010 Flash Crash',      crashMonth: 36, worstDrop: 0.10, expectedDrop: 0.05, recoveryMonths: 3  },
  taper_tantrum_2013:  { label: '2013 Taper Tantrum',    crashMonth: 36, worstDrop: 0.15, expectedDrop: 0.08, recoveryMonths: 6  },
  pandemic_2020:       { label: '2020 Pandemic',         crashMonth: 36, worstDrop: 0.38, expectedDrop: 0.25, recoveryMonths: 18 },
};

import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-boardroom',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  templateUrl: './boardroom.html',
  styleUrls: ['./boardroom.css'],
})
export class BoardroomComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly cdr  = inject(ChangeDetectorRef);
  public stateService = inject(StateService);

  // ── Inputs ───────────────────────────────────────────────────────────────
  monthlySip       = 5000;
  expectedReturn   = 12;
  timeHorizonYears = 10;
  volatility       = 15;
  portfolioStrategy: keyof typeof STRATEGY_PROFILES = 'flexi_cap';
  macroShock:        keyof typeof SHOCK_PROFILES     = 'none';

  // ── Agent Swarm State ─────────────────────────────────────────────────────
  quantReport:      string | null = null;
  complianceReport: string | null = null;
  macroReport:      string | null = null;
  systemStatus = '';

  quantTokens: number | null = null;
  complianceTokens: number | null = null;
  macroTokens: number | null = null;
  chairmanTokens: number | null = null;

  streamStatus: StreamStatus = {
    quant: 'idle',
    compliance: 'idle',
    macro: 'idle',
    chairman: 'idle'
  };

  isLoadingQuant      = false;
  isLoadingCompliance = false;
  isLoadingMacro      = false;

  // ── Chairman Orchestrator State ───────────────────────────────────────────
  debateTranscript:    TranscriptMessage[] = [];
  finalVerdict:        string | null = null;
  isChairmanThinking = false;
  showAuditTrail     = false;

  get verdictStatusClass(): string {
    if (!this.finalVerdict) return '';
    const text = this.finalVerdict.toLowerCase();
    if (text.includes('unable to approve') || text.includes('veto')) {
      return 'status-rejected';
    }
    if (text.includes('approve')) {
      return 'status-approved';
    }
    return '';
  }

  // ── Executive Summary Parsers ─────────────────────────────────────────────
  parseReportPartA(text: string): string {
    if (!text) return '';
    const execMatch = text.match(/\[EXECUTIVE SUMMARY\]([\s\S]*?)\[DETAILED ANALYSIS\]/i);
    let result = execMatch ? execMatch[1].trim() : text.trim();
    
    // Strip [EXECUTIVE SUMMARY] if it's at the beginning of the text to prevent duplication with the micro-badge
    if (result.toUpperCase().startsWith('[EXECUTIVE SUMMARY]')) {
      result = result.replace(/^\[EXECUTIVE SUMMARY\]\s*/i, '').trim();
    }
    
    return result;
  }

  parseReportPartB(report: string | null): string {
    if (!report) return '';
    const match = report.match(/\[DETAILED ANALYSIS\]([\s\S]*)/i);
    return match ? match[1].trim() : '';
  }

  // ── PDF Export State ──────────────────────────────────────────────────────
  isExportingPDF = false;

  // ── Odometer Logic ────────────────────────────────────────────────────────
  displayProjectedExpected = 0;
  private animationFrameId: any;

  animateValue(start: number, end: number, duration: number) {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      this.displayProjectedExpected = Math.floor(ease * (end - start) + start);
      if (progress < 1) {
        this.animationFrameId = window.requestAnimationFrame(step);
      }
    };
    if (this.animationFrameId) window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = window.requestAnimationFrame(step);
  }

  /** Top-level error shown when a network/server failure occurs */
  parseError = '';

  hasRunSwarm = false;

  /** True while ANY agent call is still in-flight (used to gate the button) */
  get isLoading(): boolean {
    return this.isLoadingQuant || this.isLoadingCompliance || this.isLoadingMacro
        || this.isChairmanThinking;
  }

  // ── KPI strip computed properties (read-only, derived from inputs) ─────────
  /** Final expected-case portfolio value — shown in the KPI strip */
  get projectedExpected(): number {
    const { expected } = this.simulateGrowth();
    return expected[expected.length - 1] ?? 0;
  }

  get projectedWorst(): number {
    const { worst } = this.simulateGrowth();
    return worst[worst.length - 1] ?? 0;
  }

  get riskAdjustedDelta(): number {
    return this.projectedExpected - (this.monthlySip * this.timeHorizonYears * 12);
  }

  /** Human-readable strategy label for the KPI strip */
  get strategyLabel(): string {
    return {
      liquid_fund: 'Liquid Fund',
      debt_fund:   'Debt Fund',
      multi_asset: 'Multi-Asset',
      large_cap:   'Large Cap',
      index_fund:  'Index Fund',
      flexi_cap:   'Flexi Cap',
      mid_cap:     'Mid Cap',
      small_cap:   'Small Cap'
    }[this.portfolioStrategy] ?? '';
  }

  /** Human-readable shock label for the KPI strip */
  get shockLabel(): string {
    return SHOCK_PROFILES[this.macroShock]?.label ?? '';
  }

  // ── Custom Chart Plugins ──────────────────────────────────────────────────
  chartPlugins = [
    {
      id: 'shockAnnotationPlugin',
      afterDraw: (chart: any) => {
        if (this.macroShock === 'none') return;
        const shock = SHOCK_PROFILES[this.macroShock];
        if (!shock || shock.crashMonth === 0) return;

        const dataset = chart.data.datasets[1];
        if (!dataset || !dataset.data) return;

        const crashIndex = shock.crashMonth - 1;
        const meta = chart.getDatasetMeta(1);
        if (!meta.data[crashIndex]) return;

        const xPos = meta.data[crashIndex].x;
        const ctx = chart.ctx;
        const topY = chart.chartArea.top;
        const bottomY = chart.chartArea.bottom;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(xPos, topY);
        ctx.lineTo(xPos, bottomY);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#da1e28';
        ctx.setLineDash([5, 5]);
        ctx.stroke();

        ctx.fillStyle = '#da1e28';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('SHOCK: ' + this.shockLabel, xPos - 5, topY + 15);
        ctx.restore();
      }
    }
  ];

  // ── Chart configuration ────────────────────────────────────────────────────
  readonly chartType: 'line' = 'line';

  chartData: ChartData<'line'> = { labels: [], datasets: [] };

  chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 500 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#9ca3af',          // --text-secondary
          font: { size: 15 },
          usePointStyle: true,
          pointStyleWidth: 10,
          padding: 20
        },
      },
      tooltip: {
        backgroundColor: '#111827', // --bg-elevated
        titleColor: '#f3f4f6',      // --text-primary
        bodyColor:  '#9ca3af',      // --text-secondary
        borderColor: '#374151',     // --border-light
        borderWidth: 1,
        callbacks: {
          title: (tooltipItems) => {
            const index = tooltipItems[0].dataIndex;
            return `Month ${index + 1}`;
          },
          label: (ctx) =>
            ` ${ctx.dataset.label}: ₹${Number(ctx.raw).toLocaleString('en-IN')}`,
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Time Horizon (Years)', color: '#9ca3af', font: { family: 'monospace', size: 12 } },
        ticks:  { 
          color: '#9ca3af', 
          font: { size: 13 },
          autoSkip: false,
          maxRotation: 0
        },
        grid:   { color: 'rgba(255, 255, 255, 0.05)' },
        border: { color: '#374151' },
      },
      y: {
        title: { display: true, text: 'Projected Value (₹)', color: '#9ca3af', font: { family: 'monospace', size: 12 } },
        ticks: {
          color: '#6b7280',
          font:  { size: 13 },
          callback: (v) => '₹' + Number(v).toLocaleString('en-IN'),
        },
        grid:   { color: 'rgba(255, 255, 255, 0.05)' },
        border: { color: '#374151' },
      },
    },
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.runSimulation();
  }

  // ── Core simulation engine ─────────────────────────────────────────────────
  /**
   * Generates three monthly SIP trajectories (Best / Expected / Worst).
   *
   * Strategy adjustment:
   *   effectiveReturn   = baseReturn + strategy.returnDelta
   *   effectiveVol      = baseVol   * strategy.volMultiplier
   *
   * Shock injection (when macroShock ≠ 'none'):
   *   At the crash trough month the portfolio value is multiplied by
   *   (1 − drop).  Recovery is then modelled as a straight-line re-growth
   *   from the crashed value back to the un-shocked baseline over
   *   `recoveryMonths` months.  After full recovery the normal compounding
   *   resumes.  This approach makes the crash visually dramatic while
   *   keeping the post-recovery trajectory mathematically consistent.
   */
  simulateGrowth(): { labels: string[]; worst: number[]; expected: number[]; best: number[] } {
    const months = this.timeHorizonYears * 12;

    // Apply strategy modifiers
    const sp     = STRATEGY_PROFILES[this.portfolioStrategy];
    const effRet = this.expectedReturn + sp.returnDelta;
    const effVol = this.volatility     * sp.volMultiplier;

    const rExp   = Math.max(0.0001, effRet             / 100 / 12);
    const rWorst = Math.max(0.0001, (effRet - effVol)  / 100 / 12);
    const rBest  = Math.max(0.0001, (effRet + effVol)  / 100 / 12);

    // Shock profile
    const shock        = SHOCK_PROFILES[this.macroShock];
    const crashM       = shock.crashMonth;                  // trough month (0 = no shock)
    const recovEndM    = crashM + shock.recoveryMonths;     // month full recovery completes

    const labels:   string[] = [];
    const worst:    number[] = [];
    const expected: number[] = [];
    const best:     number[] = [];

    // Baseline SIP future-value at month n (annuity-due formula)
    const sipFV = (r: number, n: number): number =>
      this.monthlySip * (((Math.pow(1 + r, n) - 1) / r) * (1 + r));

    // Dynamic X-axis label density to prevent collisions
    let yearStep = 1;
    if (this.timeHorizonYears > 25) {
      yearStep = 5;
    } else if (this.timeHorizonYears > 12) {
      yearStep = 2;
    }

    for (let m = 1; m <= months; m++) {
      if (m % 12 === 0) {
        const year = m / 12;
        labels.push(year % yearStep === 0 ? `Year ${year}` : '');
      } else {
        labels.push('');
      }

      let wv = sipFV(rWorst, m);
      let ev = sipFV(rExp,   m);
      let bv = sipFV(rBest,  m);

      if (crashM > 0 && m >= crashM && m <= recovEndM) {
        // Value at the crash trough (immediately after the drop hits)
        const crashedW = sipFV(rWorst, crashM) * (1 - shock.worstDrop);
        const crashedE = sipFV(rExp,   crashM) * (1 - shock.expectedDrop);
        const crashedB = sipFV(rBest,  crashM) * (1 - shock.expectedDrop * 0.55);

        if (m === crashM) {
          // At the trough month — show the crashed value
          wv = crashedW;
          ev = crashedE;
          bv = crashedB;
        } else {
          // Recovery: linearly interpolate between crashed value and the
          // unshocked baseline value at the recovery-end month.
          const baselineAtRecovW = sipFV(rWorst, recovEndM);
          const baselineAtRecovE = sipFV(rExp,   recovEndM);
          const baselineAtRecovB = sipFV(rBest,  recovEndM);

          const progress = (m - crashM) / shock.recoveryMonths; // 0→1
          wv = crashedW + progress * (baselineAtRecovW - crashedW);
          ev = crashedE + progress * (baselineAtRecovE - crashedE);
          bv = crashedB + progress * (baselineAtRecovB - crashedB);
        }
      }

      worst.push(   Math.round(wv));
      expected.push(Math.round(ev));
      best.push(    Math.round(bv));
    }

    return { labels, worst, expected, best };
  }

  runSimulation(): void {
    const { labels, worst, expected, best } = this.simulateGrowth();

    const oldExpected = this.displayProjectedExpected;
    const newExpected = expected[expected.length - 1] ?? 0;
    this.animateValue(oldExpected, newExpected, 800);

    const datasets: ChartDataset<'line'>[] = [
      {
        label: 'Best Case',
        data:  best,
        borderColor:     '#08bdba',
        backgroundColor: 'rgba(8,189,186,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: '+1',
      },
      {
        label: 'Expected Case',
        data:  expected,
        borderColor:     '#0f62fe',
        backgroundColor: (context) => {
          const chart = context.chart;
          const { ctx, chartArea } = chart;
          if (!chartArea) return 'rgba(15,98,254,0.10)';
          const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradient.addColorStop(0, 'rgba(15, 98, 254, 0.4)');
          gradient.addColorStop(1, 'rgba(15, 98, 254, 0.0)');
          return gradient;
        },
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.4,
        fill: true,
      },
      {
        label: 'Worst Case',
        data:  worst,
        borderColor:     '#ee5396',
        backgroundColor: 'rgba(238,83,150,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
        fill: '-1',
      },
    ];

    // Full object reassignment forces BaseChartDirective to re-render
    this.chartData = { labels, datasets };
    this.cdr.detectChanges();
  }

  // ── Asynchronous Agent Swarm (SSE) ──────────────────────────────────────
  async analyzeData(): Promise<void> {
    const { worst, best, expected } = this.simulateGrowth();
    const worstFV    = worst[worst.length - 1];
    const bestFV     = best[best.length - 1];
    const expectedFV = expected[expected.length - 1];
    const invested   = this.monthlySip * this.timeHorizonYears * 12;
    const shockLabel = SHOCK_PROFILES[this.macroShock].label;
    const stratLabel = this.strategyLabel;

    // Shared simulation context injected into every agent prompt
    const context =
      `SIP Rs.${this.monthlySip}/mo, ${stratLabel} fund, ` +
      `${this.timeHorizonYears}-yr horizon, shock: ${shockLabel}, ` +
      `invested Rs.${invested.toLocaleString('en-IN')}, ` +
      `worst-case Rs.${worstFV.toLocaleString('en-IN')}, ` +
      `expected Rs.${expectedFV.toLocaleString('en-IN')}, ` +
      `best-case Rs.${bestFV.toLocaleString('en-IN')}.\n` +
      `Extracted PDF Context: ${this.stateService.extractedContext || 'None'}`;

    // Reset all state before kicking off the pipeline
    this.quantReport       = null;
    this.complianceReport  = null;
    this.macroReport       = null;
    this.debateTranscript  = [];
    this.finalVerdict      = null;
    this.parseError        = '';
    
    this.streamStatus = {
      quant: 'loading',
      compliance: 'loading',
      macro: 'loading',
      chairman: 'idle'
    };
    this.hasRunSwarm = true;
    this.systemStatus = 'Initializing Map-Reduce Swarm...';
    
    // Sync old flags just in case they are used elsewhere
    this.quantTokens = null;
    this.complianceTokens = null;
    this.macroTokens = null;
    this.chairmanTokens = null;
    this.isLoadingQuant = true;
    this.isLoadingCompliance = true;
    this.isLoadingMacro = true;
    this.isChairmanThinking = false;
    
    this.cdr.detectChanges();

    try {
      const response = await fetch(`${this.stateService.apiBaseUrl}/api/chat/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_prompt: "Convene the boardroom and perform Map-Reduce analysis.",
          company_context: context,
          custom_mandates: this.stateService.customMandates
        })
      });

      if (!response.body) throw new Error('ReadableStream not supported.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';


      while (true) {
        const { done, value } = await reader.read();
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true });
          buffer += chunkStr;
          
          const lines = buffer.split(/\r?\n\r?\n/);
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const cleanLine = line.trim();
            if (cleanLine.startsWith('data:')) {
              const dataStr = cleanLine.substring(5).trim();
              try {
                const data = JSON.parse(dataStr);
                this.handleStreamEvent(data);
              } catch (e) {
                // Silently ignore malformed SSE chunks
              }
            }
          }
        }
        
        if (done) {
          if (buffer.trim().startsWith('data:')) {
              const dataStr = buffer.trim().substring(5).trim();
              try {
                const data = JSON.parse(dataStr);
                this.handleStreamEvent(data);
              } catch(e) {}
          }
          break;
        }
      }
    } catch (err: any) {
      this.parseError = 'Stream Error: ' + err.message;
    } finally {
      this.isLoadingQuant = false;
      this.isLoadingCompliance = false;
      this.isLoadingMacro = false;
      this.isChairmanThinking = false;
      this.cdr.detectChanges();
    }
  }

  private handleStreamEvent(data: any) {
    if (data.agent === 'system') {
      if (data.status === 'done') {
        this.systemStatus = '';
      } else {
        this.systemStatus = data.status;
        if (data.status.includes('Synthesizing')) {
           this.streamStatus.chairman = 'loading';
           this.isChairmanThinking = true;
        }
      }
    } else if (data.agent === 'quant') {
      this.quantReport = data.content;
      this.quantTokens = data.tokens;
      this.streamStatus.quant = 'complete';
      this.isLoadingQuant = false;
      this.debateTranscript.push({ role: 'Quant', text: data.content, cssClass: 'quant' });
    } else if (data.agent === 'compliance') {
      this.complianceReport = data.content;
      this.complianceTokens = data.tokens;
      this.streamStatus.compliance = 'complete';
      this.isLoadingCompliance = false;
      this.debateTranscript.push({ role: 'Compliance', text: data.content, cssClass: 'compliance' });
    } else if (data.agent === 'macro') {
      this.macroReport = data.content;
      this.macroTokens = data.tokens;
      this.streamStatus.macro = 'complete';
      this.isLoadingMacro = false;
      this.debateTranscript.push({ role: 'Macro', text: data.content, cssClass: 'macro' });
    } else if (data.agent === 'chairman') {
      this.streamStatus.chairman = 'complete';
      this.isChairmanThinking = false;
      this.finalVerdict = data.content;
      this.chairmanTokens = data.tokens;
      this.showAuditTrail = false;
      this.debateTranscript.push({
        role:     'Chairman',
        text:     data.content,
        cssClass: 'chairman',
      });
    } else if (data.agent === 'error') {
      this.parseError = 'Backend Pipeline Error: ' + data.content;
      this.isLoadingQuant = false;
      this.isLoadingCompliance = false;
      this.isLoadingMacro = false;
      this.isChairmanThinking = false;
      this.systemStatus = 'Pipeline Halted.';
    }
    
    this.cdr.detectChanges();
  }


  toggleAuditTrail(): void {
    this.showAuditTrail = !this.showAuditTrail;
  }

  // ── PDF Compiler ───────────────────────────────────────────────────────────
  /**
   * Screenshots the entire #pdf-export-zone (KPIs + Chart + AI panel) at 2×
   * resolution via html2canvas, then fits the resulting image onto a portrait
   * A4 page (210 × 297 mm) using jsPDF without stretching.
   */
  async exportToPDF(): Promise<void> {
    this.isExportingPDF = true;
    this.cdr.detectChanges();

    try {
      const zone = document.getElementById('pdf-export-zone');
      if (!zone) throw new Error('pdf-export-zone element not found');

      const canvas = await html2canvas(zone, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL('image/png');

      const pdf         = new jsPDF('p', 'mm', 'a4');
      const pageWidth   = pdf.internal.pageSize.getWidth();   // 210 mm
      const pageHeight  = pdf.internal.pageSize.getHeight();  // 297 mm

      // Scale the image to fit page width; if taller than one page, shrink to fit height too
      const ratio      = canvas.width / canvas.height;
      let imgWidth     = pageWidth;
      let imgHeight    = imgWidth / ratio;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth  = imgHeight * ratio;
      }

      // Centre horizontally if image is narrower than page after height-fit
      const xOffset = (pageWidth - imgWidth) / 2;
      pdf.addImage(imgData, 'PNG', xOffset, 0, imgWidth, imgHeight);
      pdf.save('FinForensic_Institutional_Report.pdf');
    } finally {
      this.isExportingPDF = false;
      this.cdr.detectChanges();
    }
  }


}
