import { Component, ChangeDetectorRef, ElementRef, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StateService } from '../../services/state.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-knowledge-base',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './knowledge-base.html',
  styleUrls: ['./knowledge-base.css']
})
export class KnowledgeBaseComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  private readonly http = inject(HttpClient);
  public stateService = inject(StateService);
  private cdr = inject(ChangeDetectorRef);

  isUploading = false;
  uploadError = '';
  totalChunks = 0;

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    this.isUploading = true;
    this.uploadError = '';
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response: any = await firstValueFrom(
        this.http.post(`${this.stateService.apiBaseUrl}/api/upload-report`, formData)
      );
      
      this.stateService.uploadedFileName = response.filename;
      this.stateService.extractedContext = `Vectorized File: ${response.filename} (${response.total_chunks} chunks)`;
      this.totalChunks = response.total_chunks;
      
    } catch (err: any) {
      this.uploadError = err.error?.detail || err.message || 'File upload failed';
      this.stateService.uploadedFileName = '';
      this.stateService.extractedContext = '';
    } finally {
      this.isUploading = false;
      this.cdr.detectChanges();
    }
  }
}
