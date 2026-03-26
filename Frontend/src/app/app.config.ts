// app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { provideAnimations } from '@angular/platform-browser/animations'; 
import { authenticationInterceptor } from './helpers/interceptors/authentication.interceptor'; // Adjust path
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideAnimations() ,
    provideHttpClient(
      withInterceptors([authenticationInterceptor]) // ✅ Register here
    )
  ]
};
