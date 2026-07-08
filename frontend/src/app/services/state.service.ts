import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class StateService {
  private _customMandates: string = '';
  private _extractedContext: string = '';
  private _uploadedFileName: string = '';

  // [M3] Simple obfuscation key for localStorage — prevents casual snooping
  private readonly STORAGE_KEY = 'ff_mandates_v1';

  // Centralized API base URL — no more hardcoded localhost scattered everywhere
  readonly apiBaseUrl = environment.apiBaseUrl;

  constructor() {
    // Load from localStorage if available (with obfuscation decode)
    const saved = localStorage.getItem(this.STORAGE_KEY);
    if (saved) {
      try {
        this._customMandates = this._decode(saved);
      } catch {
        // If decode fails (corrupted/tampered), silently discard
        localStorage.removeItem(this.STORAGE_KEY);
      }
    }
  }

  get customMandates(): string {
    return this._customMandates;
  }

  set customMandates(value: string) {
    this._customMandates = value;
    localStorage.setItem(this.STORAGE_KEY, this._encode(value));
  }

  get extractedContext(): string {
    return this._extractedContext;
  }

  set extractedContext(value: string) {
    this._extractedContext = value;
  }

  get uploadedFileName(): string {
    return this._uploadedFileName;
  }

  set uploadedFileName(value: string) {
    this._uploadedFileName = value;
  }

  // [M3] Base64 encode/decode to prevent casual plaintext snooping in devtools
  private _encode(text: string): string {
    try {
      return btoa(unescape(encodeURIComponent(text)));
    } catch {
      return text;
    }
  }

  private _decode(encoded: string): string {
    try {
      return decodeURIComponent(escape(atob(encoded)));
    } catch {
      return encoded;
    }
  }
}
