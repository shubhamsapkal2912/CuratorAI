// main.ts - FIXED
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config'; // ✅ Use appConfig

bootstrapApplication(AppComponent, appConfig) // ✅ Single config with interceptors
  .catch(err => console.error(err));
