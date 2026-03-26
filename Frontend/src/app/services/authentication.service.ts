// authentication.service.ts
import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { LoginPayload, LoginResponse } from '../helpers/model/authentication.model';
import { Router } from '@angular/router'; // Add Router import

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  private readonly API_URL = environment.apiBaseUrl;
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(
    private http: HttpClient,
    private router: Router // Inject Router
  ) {}

  login(credentials: LoginPayload): Observable<LoginResponse> {
    const loginUrl = this.buildApiUrl('user/login');
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    });
    const payload = {
      email: credentials.email.trim(),
      password: credentials.password
    };

    return this.http.post<LoginResponse>(loginUrl, payload, { headers }).pipe(
      tap(response => {
        if (response.access) {
          // Store tokens
          localStorage.setItem('access_token', response.access);
          localStorage.setItem('name', response.name || '');
          if (response.refresh) {
            localStorage.setItem('refresh_token', response.refresh);
          }
          
          // Store user info from API response
          const user = {
            name: response.name || '',
            email: response.email || credentials.email,
            username: response.email || credentials.email,
            user_id: this.getUserIdFromToken(response.access) // Extract from token
          };
          
          localStorage.setItem('user', JSON.stringify(user));
          this.isAuthenticatedSubject.next(true);
        }
      }),
      map(response => response),
      catchError(this.handleError)
    );
  }

  private buildApiUrl(path: string): string {
    const trimmedBaseUrl = this.API_URL.trim().replace(/\/+$/, '');
    const normalizedApiBase = trimmedBaseUrl.endsWith('/api')
      ? `${trimmedBaseUrl}/`
      : `${trimmedBaseUrl}/api/`;

    return new URL(path.replace(/^\/+/, ''), normalizedApiBase).toString();
  }

  // Helper to extract user ID from JWT token
  private getUserIdFromToken(token: string): string {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.user_id || payload.sub || '1';
    } catch {
      return '1';
    }
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    let errorMessage = 'Login failed; please try again.';
    
    if (error.status === 400) {
      errorMessage = this.extractErrorMessage(error.error, 'Invalid email or password.');
    } else if (error.status === 401) {
      errorMessage = 'Invalid credentials.';
    } else if (error.status === 500) {
      errorMessage = 'Server error. Please try again later.';
    } else if (error.status === 0) {
      errorMessage = 'Cannot connect to server. Please check your connection.';
    }
    
    return throwError(() => new Error(errorMessage));
  }

  private extractErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'string' && error.trim()) {
      return error;
    }

    if (Array.isArray(error)) {
      const firstMessage = error.find(item => typeof item === 'string' && item.trim());
      return typeof firstMessage === 'string' ? firstMessage : fallback;
    }

    if (typeof error === 'object' && error !== null) {
      const errorRecord = error as Record<string, unknown>;

      for (const key of ['message', 'error', 'detail']) {
        const value = errorRecord[key];
        const extracted = this.extractErrorMessage(value, '');
        if (extracted) {
          return extracted;
        }
      }

      for (const value of Object.values(errorRecord)) {
        const extracted = this.extractErrorMessage(value, '');
        if (extracted) {
          return extracted;
        }
      }
    }

    return fallback;
  }

  private hasToken(): boolean {
    return !!localStorage.getItem('access_token');
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  getUser(): any {
    try {
      const userStr = localStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    } catch (error) {
      console.error('Error parsing user info:', error);
      return null;
    }
  }

  logout(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    this.isAuthenticatedSubject.next(false);
    this.router.navigate(['/login']);
  }

  isLoggedIn(): boolean {
    return this.hasToken();
  }

  isTokenExpired(): boolean {
    const token = this.getToken();
    if (!token) return true;
    
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000;
      return Date.now() >= exp;
    } catch {
      return true;
    }
  }

  checkTokenValidity(): boolean {
    const hasToken = this.hasToken();
    const isExpired = this.isTokenExpired();
    
    if (hasToken && isExpired) {
      this.logout();
      return false;
    }
    
    return hasToken && !isExpired;
  }
}
