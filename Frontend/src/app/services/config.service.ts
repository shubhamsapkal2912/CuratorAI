import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RequestOptions {
  headers?: HttpHeaders | { [header: string]: string | string[] };
  params?: HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean> };
}

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private baseUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  private buildUrl(endpoint: string): string {
    const normalizedBaseUrl = this.baseUrl.endsWith('/')
      ? this.baseUrl
      : `${this.baseUrl}/`;

    return new URL(endpoint.replace(/^\/+/, ''), normalizedBaseUrl).toString();
  }

  resolveUrl(endpoint: string): string {
    return this.buildUrl(endpoint);
  }

  // Generic GET method
  get(endpoint: string, options?: RequestOptions): Observable<any> {
    return this.http.get(this.buildUrl(endpoint), options);
  }

  // Generic POST method
  post(endpoint: string, data?: any, options?: RequestOptions): Observable<any> {
    return this.http.post(this.buildUrl(endpoint), data, options);
  }

  // Generic PUT method
  put(endpoint: string, data?: any, options?: RequestOptions): Observable<any> {
    return this.http.put(this.buildUrl(endpoint), data, options);
  }

  // Generic PATCH method
  patch(endpoint: string, data?: any, options?: RequestOptions): Observable<any> {
    return this.http.patch(this.buildUrl(endpoint), data, options);
  }

  // Generic DELETE method
  delete(endpoint: string, options?: RequestOptions): Observable<any> {
    return this.http.delete(this.buildUrl(endpoint), options);
  }

  // Add this method to your existing ConfigService
getBlob(path: string): Observable<Blob> {
  return this.http.get(this.buildUrl(path), {
    responseType: 'blob',
  });
}

}
