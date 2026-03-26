import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfigService } from './config.service';

export interface ApiDocumentRecord {
  id?: string | number;
  filename?: string;
  file_name?: string;
  name?: string;
  title?: string;
  size?: string | number;
  file_size?: string | number;
  status?: string;
  uploaded_at?: string;
  created_at?: string;
  updated_at?: string;
  chunks?: number | string;
  chunk_count?: number | string;
  embeddings?: number | string;
  embedding_count?: number | string;
}

@Injectable({
  providedIn: 'root'
})
export class DocumentsService {
  constructor(private configService: ConfigService) {}

  uploadDocument(file: File): Observable<unknown> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('filename', file.name);

    return this.configService.post('api/documents/upload/', formData);
  }

  listDocuments(): Observable<ApiDocumentRecord[]> {
    return this.configService.get('api/documents/list/').pipe(
      map(response => this.normalizeListResponse(response))
    );
  }

  private normalizeListResponse(response: any): ApiDocumentRecord[] {
    if (Array.isArray(response)) {
      return response;
    }

    if (Array.isArray(response?.documents)) {
      return response.documents;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    if (Array.isArray(response?.results)) {
      return response.results;
    }

    return [];
  }
}
