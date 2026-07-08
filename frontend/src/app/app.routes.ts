import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home';
import { BoardroomComponent } from './components/boardroom/boardroom';
import { KnowledgeBaseComponent } from './components/knowledge-base/knowledge-base';
import { MandatesComponent } from './components/mandates/mandates';

export const routes: Routes = [
  { path: '', redirectTo: '/home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'boardroom', component: BoardroomComponent },
  { path: 'knowledge-base', component: KnowledgeBaseComponent },
  { path: 'mandates', component: MandatesComponent },
  { path: '**', redirectTo: '/home' }
];
