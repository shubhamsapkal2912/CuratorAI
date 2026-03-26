import {
  Component, Input, Output, EventEmitter,
  OnInit, OnDestroy, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { AvatarModule } from 'primeng/avatar';
import { BadgeModule } from 'primeng/badge';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service'; 
import { Router } from '@angular/router';

@Component({
  selector: 'app-top-bar',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, AvatarModule, BadgeModule],
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.css'
})
export class TopBarComponent implements OnInit, OnDestroy {
  @Input() pageTitle: string = 'Document Library';
  @Input() showSearch: boolean = true;
  @Output() searchChange = new EventEmitter<string>();
  @Output() notificationClick = new EventEmitter<void>();
  @Output() settingsClick = new EventEmitter<void>();

  searchQuery = signal<string>('');
  hasNotifications = signal<boolean>(true);

  private destroy$ = new Subject<void>();
  private searchSubject = new Subject<string>();

  constructor(
    public authService: AuthenticationService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.searchSubject.pipe(
      debounceTime(350),
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe(val => this.searchChange.emit(val));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  getUserInitials(): string {
    const name = this.authService.getUser()?.name ?? 'User';
    return name.split(' ').map((n: any[]) => n[0]).join('').toUpperCase().slice(0, 2);
  }

  goToSettings(): void {
    this.settingsClick.emit();
  }

  goToNotifications(): void {
    this.notificationClick.emit();
  }
}
