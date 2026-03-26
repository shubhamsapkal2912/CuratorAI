// login.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service'; // Adjust path

// PrimeNG Imports
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message'; // For error messages
import { MessagesModule } from 'primeng/messages';
import { RippleModule } from 'primeng/ripple';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
    ButtonModule,
    MessageModule,
    MessagesModule,
    RippleModule,
    AvatarModule,
    AvatarGroupModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {
onForgotPassword() {
throw new Error('Method not implemented.');
}
onContactAdmin() {
throw new Error('Method not implemented.');
}
  loginForm!: FormGroup;
  isPasswordVisible: boolean = false;
  isSubmitting: boolean = false;
  errorMessage: string = '';
  messages: string[] = [];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private authService: AuthenticationService // Inject service
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      rememberMe: [false]
    });
  }

  togglePasswordVisibility(): void {
    this.isPasswordVisible = !this.isPasswordVisible;
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.isSubmitting = true;
      this.errorMessage = '';
      this.messages = [];
      
      const { email, password } = this.loginForm.getRawValue();
      const credentials = { email, password };
      
      this.authService.login(credentials).subscribe({
        next: (response: any) => {
          this.isSubmitting = false;
          if (response?.access) {
            // Service handles token storage and auth state
            this.router.navigate(['/dashboard']);
            return;
          }

          this.errorMessage = 'Login response did not include an access token.';
          this.messages = [this.errorMessage];
        },
        error: (error: { message: string; }) => {
          this.isSubmitting = false;
          this.errorMessage = error.message;
          this.messages = [error.message];
          console.error('Login error:', error);
        }
      });
    } else {
      this.errorMessage = 'Enter your email and password to continue.';
      this.messages = [this.errorMessage];
      this.markFormGroupTouched(this.loginForm);
    }
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
    });
  }

  get email() {
    return this.loginForm.get('email');
  }

  get password() {
    return this.loginForm.get('password');
  }

  // username = '';
  // password = '';
  rememberMe = false;
  showPassword = false;

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }



  loginWithGoogle(): void {
    console.log('Google OAuth initiated');
  }

  loginWithSSO(): void {
    console.log('SSO flow initiated');
  }
}
