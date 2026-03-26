import { Component, signal, computed, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Router, RouterLink } from '@angular/router';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AuthenticationService } from '../../services/authentication.service';
import { ApiDocumentRecord, DocumentsService } from '../../services/documents.service';

export type DocStatus = 'indexed' | 'processing' | 'error';
export type DocType = 'pdf' | 'csv' | 'docx' | 'txt' | 'md';

export interface KnowledgeDoc {
  id: string;
  name: string;
  type: DocType;
  size: string;
  status: DocStatus;
  uploadedAt: string;
  chunks?: number;
  embeddings?: string;
  progress?: number;
  featured?: boolean;
  collaborators?: number;
}

@Component({
  selector: 'app-documents',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    TagModule,
    ProgressBarModule,
    TooltipModule,
    ConfirmDialogModule,
    ToastModule,
    RouterLink,
    TopBarComponent,
    SidebarComponent,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './documents.component.html',
  styleUrl: './documents.component.css'
})
export class DocumentsComponent implements OnInit, OnDestroy {
  activeMenu = 'documents';
  isLoading = signal(true);

  viewMode = signal<'grid' | 'list'>('grid');
  searchTerm = signal<string>('');
  isLoadingMore = signal<boolean>(false);
  showFab = signal<boolean>(false);

  private allDocs = signal<KnowledgeDoc[]>([]);

  filteredDocs = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) return this.allDocs();
    return this.allDocs().filter(d => d.name.toLowerCase().includes(term));
  });

  featuredDoc = computed(() =>
    this.filteredDocs().find(d => d.featured) ?? null
  );

  regularDocs = computed(() =>
    this.filteredDocs().filter(d => !d.featured)
  );

  documentCount = computed(() => this.allDocs().length);

  totalVectors = computed(() =>
    this.allDocs().reduce((total, doc) => total + (doc.chunks ?? 0), 0)
  );

  private fabTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private confirmationService: ConfirmationService,
    private messageService: MessageService,
    private router: Router,
    private authService: AuthenticationService,
    private documentsService: DocumentsService
  ) {
    this.fabTimeout = setTimeout(() => this.showFab.set(true), 400);
  }

  ngOnInit(): void {
    this.loadDocuments();
  }

  ngOnDestroy(): void {
    clearTimeout(this.fabTimeout);
  }

  setViewMode(mode: 'grid' | 'list'): void {
    this.viewMode.set(mode);
  }

  onSearch(term: string): void {
    this.searchTerm.set(term);
  }

  getDocIcon(type: DocType): string {
    const icons: Record<DocType, string> = {
      pdf: 'pi pi-file-pdf',
      csv: 'pi pi-table',
      docx: 'pi pi-file-word',
      txt: 'pi pi-file-edit',
      md: 'pi pi-code'
    };
    return icons[type];
  }

  getStatusSeverity(status: DocStatus): 'success' | 'info' | 'danger' | 'warning' {
    const map: Record<DocStatus, 'success' | 'info' | 'danger' | 'warning'> = {
      indexed: 'success',
      processing: 'info',
      error: 'danger'
    };
    return map[status];
  }

  getStatusLabel(status: DocStatus): string {
    const labels: Record<DocStatus, string> = {
      indexed: 'Indexed',
      processing: 'Processing',
      error: 'Error'
    };
    return labels[status];
  }

  reindexDoc(doc: KnowledgeDoc, event: MouseEvent): void {
    event.stopPropagation();
    this.messageService.add({
      severity: 'info',
      summary: 'Re-indexing',
      detail: `${doc.name} has been queued for re-indexing.`,
      life: 3000
    });
    this.allDocs.update(docs =>
      docs.map(d => d.id === doc.id ? { ...d, status: 'processing', progress: 0 } : d)
    );
    setTimeout(() => {
      this.allDocs.update(docs =>
        docs.map(d => d.id === doc.id ? { ...d, status: 'indexed', progress: undefined } : d)
      );
      this.messageService.add({
        severity: 'success',
        summary: 'Re-indexed',
        detail: `${doc.name} has been successfully re-indexed.`,
        life: 3000
      });
    }, 4000);
  }

  confirmDelete(doc: KnowledgeDoc, event: MouseEvent): void {
    event.stopPropagation();
    this.confirmationService.confirm({
      message: `Are you sure you want to remove <strong>${doc.name}</strong>? This will permanently delete all associated vectors.`,
      header: 'Remove Document',
      icon: 'pi pi-trash',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: 'Yes, Remove',
      rejectLabel: 'Cancel',
      accept: () => this.deleteDoc(doc)
    });
  }

  private deleteDoc(doc: KnowledgeDoc): void {
    this.allDocs.update(docs => docs.filter(d => d.id !== doc.id));
    this.messageService.add({
      severity: 'warn',
      summary: 'Document Removed',
      detail: `${doc.name} and its vectors have been deleted.`,
      life: 4000
    });
  }

  cancelProcessing(doc: KnowledgeDoc, event: MouseEvent): void {
    event.stopPropagation();
    this.allDocs.update(docs => docs.filter(d => d.id !== doc.id));
    this.messageService.add({
      severity: 'info',
      summary: 'Upload Cancelled',
      detail: `${doc.name} has been removed from processing.`,
      life: 3000
    });
  }

  loadMore(): void {
    this.isLoadingMore.set(true);
    setTimeout(() => {
      this.isLoadingMore.set(false);
      this.messageService.add({
        severity: 'info',
        summary: 'All caught up',
        detail: 'No more documents to load.',
        life: 3000
      });
    }, 1200);
  }

  openAssistant(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'AI Assistant',
      detail: 'Opening assistant panel...',
      life: 2000
    });
  }

  onMenuSelect(menuId: string): void {
    if (menuId === 'logout') {
      this.authService.logout();
      return;
    }

    if (menuId === 'help') {
      this.messageService.add({
        severity: 'info',
        summary: 'Help',
        detail: 'Help center is not connected yet.',
        life: 2500
      });
      return;
    }

    this.activeMenu = menuId;
    this.router.navigate([`/${menuId}`]);
  }

  private loadDocuments(): void {
    this.isLoading.set(true);

    this.documentsService.listDocuments().subscribe({
      next: response => {
        const mappedDocuments = response.map((document, index) => this.mapDocument(document, index));
        this.allDocs.set(mappedDocuments);
        this.isLoading.set(false);
      },
      error: (error: Error) => {
        this.isLoading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Documents Unavailable',
          detail: error.message || 'Could not load documents from the server.',
          life: 3500
        });
      }
    });
  }

  private mapDocument(document: ApiDocumentRecord, index: number): KnowledgeDoc {
    const name = this.getDocumentName(document, index);
    const status = this.mapDocumentStatus(document.status);
    const chunkCount = this.parseNumber(document.chunks ?? document.chunk_count);
    const embeddings = this.parseNumber(document.embeddings ?? document.embedding_count);

    return {
      id: String(document.id ?? `${name}-${index}`),
      name,
      type: this.getDocumentType(name),
      size: this.formatFileSize(document.file_size ?? document.size),
      status,
      uploadedAt: this.formatUploadedAt(document.uploaded_at ?? document.created_at ?? document.updated_at),
      chunks: chunkCount ?? undefined,
      embeddings: embeddings !== null ? embeddings.toLocaleString() : undefined,
      progress: status === 'processing' ? 65 : undefined,
      featured: index === 0,
      collaborators: index === 0 ? 3 : undefined
    };
  }

  private getDocumentName(document: ApiDocumentRecord, index: number): string {
    return (
      document.filename ??
      document.file_name ??
      document.name ??
      document.title ??
      `Document ${index + 1}`
    );
  }

  private getDocumentType(name: string): DocType {
    const extension = name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'pdf':
        return 'pdf';
      case 'csv':
        return 'csv';
      case 'doc':
      case 'docx':
        return 'docx';
      case 'md':
        return 'md';
      default:
        return 'txt';
    }
  }

  private mapDocumentStatus(status?: string): DocStatus {
    const normalizedStatus = status?.toLowerCase() ?? '';

    if (normalizedStatus.includes('error') || normalizedStatus.includes('fail')) {
      return 'error';
    }

    if (normalizedStatus.includes('process') || normalizedStatus.includes('pending') || normalizedStatus.includes('queue')) {
      return 'processing';
    }

    return 'indexed';
  }

  private formatFileSize(value?: string | number): string {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      const sizeInMb = value / (1024 * 1024);
      if (sizeInMb >= 1) {
        return `${sizeInMb.toFixed(1)} MB`;
      }

      return `${Math.max(1, Math.round(value / 1024))} KB`;
    }

    return 'Unknown size';
  }

  private formatUploadedAt(value?: string): string {
    if (!value) {
      return 'Uploaded recently';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(value);
    }

    return `Uploaded ${new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(parsedDate)}`;
  }

  private parseNumber(value?: string | number): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsedValue = Number(value);
      return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    return null;
  }
}
