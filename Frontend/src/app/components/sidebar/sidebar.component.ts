import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RippleModule } from 'primeng/ripple';

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RippleModule],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.css'
})
export class SidebarComponent {
  @Input() activeMenu: string = 'upload';
  @Output() menuSelect = new EventEmitter<string>();

  mainNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard',  icon: 'pi pi-th-large' },
    { id: 'documents', label: 'Documents',  icon: 'pi pi-file'     },
    { id: 'upload',    label: 'Upload',      icon: 'pi pi-upload'   },
  ];

  bottomNavItems: NavItem[] = [
    { id: 'help',   label: 'Help',   icon: 'pi pi-question-circle' },
    { id: 'logout', label: 'Logout', icon: 'pi pi-sign-out'        },
  ];

  select(id: string): void {
    this.menuSelect.emit(id);
  }
}
