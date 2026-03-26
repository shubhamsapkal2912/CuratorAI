import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { AuthenticationService } from '../../services/authentication.service';
import { DocumentsService } from '../../services/documents.service';

export type FileStatus = 'queued' | 'uploading' | 'complete' | 'error';

export interface QueueFile {
  id: string;
  name: string;
  size: string;
  progress: number;
  status: FileStatus;
  icon: string;
  rawFile: File;
  errorMessage?: string;
}

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [
    CommonModule,
    ButtonModule,
    ProgressBarModule,
    RippleModule,
    ToastModule,
    SidebarComponent,
  ],
  providers: [MessageService],
  templateUrl: './upload.component.html',
  styleUrl: './upload.component.css'
})
export class UploadComponent {
  activeMenu = 'upload';
  isDragOver = signal(false);
  isUploading = signal(false);

  uploadQueue = signal<QueueFile[]>([]);

  constructor(
    private messageService: MessageService,
    private router: Router,
    private authService: AuthenticationService,
    private documentsService: DocumentsService
  ) {}

  get queueCount(): number {
    return this.uploadQueue().length;
  }

  get hasPendingUploads(): boolean {
    return this.uploadQueue().some(file => file.status === 'queued' || file.status === 'error');
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.processFiles(files);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.processFiles(input.files);
      input.value = '';
    }
  }

  private processFiles(files: FileList): void {
    const allowedTypes = ['.pdf'];

    Array.from(files).forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedTypes.includes(ext)) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Unsupported File',
          detail: `${file.name} is not a supported PDF file.`
        });
        return;
      }

      const sizeMb = file.size / (1024 * 1024);
      if (sizeMb > 50) {
        this.messageService.add({
          severity: 'error',
          summary: 'File Too Large',
          detail: `${file.name} exceeds the 50 MB limit.`
        });
        return;
      }

      const newFile: QueueFile = {
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        size: sizeMb > 1
          ? `${sizeMb.toFixed(1)} MB`
          : `${(file.size / 1024).toFixed(0)} KB`,
        progress: 0,
        status: 'queued',
        icon: this.getIcon(ext),
        rawFile: file
      };

      this.uploadQueue.update(q => [...q, newFile]);
    });
  }

  private getIcon(ext: string): string {
    const iconMap: Record<string, string> = {
      '.pdf': 'pi pi-file-pdf',
      '.docx': 'pi pi-file',
      '.txt': 'pi pi-file-edit',
      '.md': 'pi pi-code'
    };
    return iconMap[ext] ?? 'pi pi-file';
  }

  triggerFileInput(): void {
    document.getElementById('hiddenFileInput')?.click();
  }

  removeFile(index: number): void {
    this.uploadQueue.update(q => q.filter((_, i) => i !== index));
  }

  async finishUpload(): Promise<void> {
    const pendingFiles = this.uploadQueue().filter(file => file.status === 'queued' || file.status === 'error');
    if (!pendingFiles.length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No Pending Uploads',
        detail: 'Add a PDF file to the queue before uploading.'
      });
      return;
    }

    this.isUploading.set(true);

    let successCount = 0;
    let failureCount = 0;

    for (const queueFile of pendingFiles) {
      this.updateQueueFile(queueFile.id, {
        status: 'uploading',
        progress: 35,
        errorMessage: undefined
      });

      try {
        await firstValueFrom(this.documentsService.uploadDocument(queueFile.rawFile));
        successCount += 1;
        this.updateQueueFile(queueFile.id, {
          status: 'complete',
          progress: 100
        });
      } catch (error) {
        failureCount += 1;
        this.updateQueueFile(queueFile.id, {
          status: 'error',
          progress: 0,
          errorMessage: this.getUploadErrorMessage(error)
        });
      }
    }

    this.isUploading.set(false);

    if (successCount) {
      this.messageService.add({
        severity: 'success',
        summary: 'Upload Complete',
        detail: `${successCount} PDF file(s) uploaded successfully.`
      });
    }

    if (failureCount) {
      this.messageService.add({
        severity: 'error',
        summary: 'Upload Failed',
        detail: `${failureCount} file(s) could not be uploaded.`
      });
    }
  }

  private updateQueueFile(id: string, changes: Partial<QueueFile>): void {
    this.uploadQueue.update(queue =>
      queue.map(file => file.id === id ? { ...file, ...changes } : file)
    );
  }

  private getUploadErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return 'Upload failed. Please try again.';
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
}
