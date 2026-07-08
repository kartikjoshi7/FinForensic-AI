import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StateService } from '../../services/state.service';

@Component({
  selector: 'app-mandates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mandates.html',
  styleUrls: ['./mandates.css']
})
export class MandatesComponent {
  public stateService = inject(StateService);

  appendTemplate(text: string) {
    if (this.stateService.customMandates.length > 0 && !this.stateService.customMandates.endsWith('\n')) {
      this.stateService.customMandates += '\n';
    }
    this.stateService.customMandates += text + '\n';
  }

  get activeBadges(): { label: string; class: string }[] {
    const text = this.stateService.customMandates.toLowerCase();
    const badges = [];
    if (text.includes('litigation')) {
      badges.push({ label: 'LITIGATION CHECK', class: 'badge-blue' });
    }
    if (text.includes('debt') || text.includes('ratio')) {
      badges.push({ label: 'DEBT CONSTRAINT', class: 'badge-purple' });
    }
    return badges;
  }

  get mandateCount(): number {
    return this.stateService.customMandates
      .split('\n')
      .filter(line => line.trim().length > 0)
      .length;
  }
}
