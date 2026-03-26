import {
  AfterViewChecked,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { AuthenticationService } from '../../services/authentication.service';
import {
  ChatConversationDetail,
  ChatConversationMessage,
  ChatConversationSummary,
  ChatService
} from '../../services/chat.service';
import { ApiDocumentRecord, DocumentsService } from '../../services/documents.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopBarComponent } from '../top-bar/top-bar.component';

export type MessageRole = 'user' | 'ai';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  timestamp: Date;
  verified?: boolean;
  hasSourceLink?: boolean;
  isError?: boolean;
  isStreaming?: boolean;
  sourceDocuments?: string[];
}

export interface SourceDoc {
  id: string;
  name: string;
  icon: string;
  reference: string;
  relevance: number;
  selected: boolean;
}

export interface MetaTag {
  label: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    TooltipModule,
    ToastModule,
    DividerModule,
    TopBarComponent,
    SidebarComponent,
  ],
  providers: [MessageService],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, AfterViewChecked {
  @ViewChild('chatScroll') private chatScroll!: ElementRef<HTMLDivElement>;

  private sanitizer = inject(DomSanitizer);
  private messageService = inject(MessageService);
  private router = inject(Router);
  private authService = inject(AuthenticationService);
  private documentsService = inject(DocumentsService);
  private chatService = inject(ChatService);

  inputText = signal<string>('');
  isThinking = signal<boolean>(false);
  isLoadingSources = signal<boolean>(true);
  sourceLoadError = signal<string | null>(null);
  isLoadingHistory = signal<boolean>(true);
  historyLoadError = signal<string | null>(null);
  isLoadingConversation = signal<boolean>(false);
  currentConversationId = signal<string | null>(null);
  private shouldScroll = false;
  private pendingSelectedDocumentNames: string[] | null = null;

  activeMenu = 'dashboard';

  messages = signal<ChatMessage[]>([]);
  conversations = signal<ChatConversationSummary[]>([]);
  sources = signal<SourceDoc[]>([]);

  metaTags: MetaTag[] = [
    { label: 'Chat' },
    { label: 'History' },
    { label: 'RAG' },
  ];

  selectedSourceCount = computed(() =>
    this.sources().filter(document => document.selected).length
  );

  selectedSourceNames = computed(() =>
    this.sources()
      .filter(document => document.selected)
      .map(document => document.name)
  );

  conversationCount = computed(() => this.conversations().length);

  currentConversation = computed(() =>
    this.conversations().find(
      conversation => conversation.id === this.currentConversationId()
    ) ?? null
  );

  currentConversationTitle = computed(() =>
    this.currentConversation()?.title ??
    (this.messages().length ? 'Current chat' : 'New chat')
  );

  showDraftConversation = computed(() =>
    !this.currentConversationId() && this.messages().length > 0
  );

  canSendMessage = computed(() =>
    this.inputText().trim().length > 0 &&
    !this.isThinking() &&
    !this.isLoadingSources() &&
    !this.isLoadingConversation() &&
    this.selectedSourceCount() > 0
  );

  ngOnInit(): void {
    this.loadSourceDocuments();
    this.loadConversationHistory();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  sendMessage(): void {
    if (!this.canSendMessage()) {
      if (!this.selectedSourceCount()) {
        this.messageService.add({
          severity: 'warn',
          summary: 'Select Documents',
          detail: 'Choose at least one document before asking a question.',
          life: 2500
        });
      }
      return;
    }

    const text = this.inputText().trim();
    const selectedDocuments = [...this.selectedSourceNames()];
    const timestamp = Date.now();
    const userMessageId = `user-${timestamp}`;
    const assistantMessageId = `ai-${timestamp + 1}`;

    this.messages.update(messages => [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        text,
        timestamp: new Date()
      },
      {
        id: assistantMessageId,
        role: 'ai',
        text: '',
        timestamp: new Date(),
        isStreaming: true
      }
    ]);

    this.inputText.set('');
    this.isThinking.set(true);
    this.shouldScroll = true;

    this.chatService.askQuestionStream(
      text,
      selectedDocuments,
      this.currentConversationId()
    ).subscribe({
      next: event => {
        if (event.type === 'start') {
          if (event.conversationId && !this.currentConversationId()) {
            this.currentConversationId.set(event.conversationId);
          }
          this.shouldScroll = true;
          return;
        }

        if (event.type === 'chunk') {
          this.updateMessage(assistantMessageId, message => ({
            ...message,
            text: event.answer,
            isStreaming: true
          }));
          this.shouldScroll = true;
          return;
        }

        this.updateMessage(assistantMessageId, message => ({
          ...message,
          text: event.answer,
          timestamp: new Date(),
          verified: true,
          hasSourceLink: true,
          isStreaming: false,
          sourceDocuments: selectedDocuments
        }));

        if (event.conversation) {
          this.currentConversationId.set(event.conversation.id);
          this.upsertConversation(event.conversation);
        }

        this.isThinking.set(false);
        this.shouldScroll = true;
      },
      error: (error: unknown) => {
        const errorMessage = this.getErrorMessage(
          error,
          'I could not get a response from the chat service.'
        );

        this.updateMessage(assistantMessageId, message => ({
          ...message,
          text: errorMessage,
          timestamp: new Date(),
          isError: true,
          isStreaming: false,
          sourceDocuments: selectedDocuments
        }));

        this.messageService.add({
          severity: 'error',
          summary: 'Chat Failed',
          detail: errorMessage,
          life: 3000
        });

        this.isThinking.set(false);
        this.shouldScroll = true;
      }
    });
  }

  onEnterKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  startNewConversation(): void {
    if (this.isThinking()) {
      return;
    }

    this.currentConversationId.set(null);
    this.inputText.set('');
    this.messages.set([]);
    this.isLoadingConversation.set(false);
    this.shouldScroll = true;
  }

  openConversation(conversation: ChatConversationSummary): void {
    if (this.isThinking()) {
      return;
    }

    this.currentConversationId.set(conversation.id);
    this.isLoadingConversation.set(true);

    this.chatService.getConversation(conversation.id).subscribe({
      next: detail => {
        this.messages.set(
          detail.messages.map(message => this.mapConversationMessage(message))
        );
        this.upsertConversation(this.buildConversationSummary(detail));
        this.selectConversationDocuments(detail);
        this.isLoadingConversation.set(false);
        this.shouldScroll = true;
      },
      error: (error: unknown) => {
        const errorMessage = this.getErrorMessage(
          error,
          'Could not load that conversation.'
        );

        this.messageService.add({
          severity: 'error',
          summary: 'Conversation Failed',
          detail: errorMessage,
          life: 3000
        });

        this.isLoadingConversation.set(false);
      }
    });
  }

  toggleSourceSelection(sourceId: string, checked: boolean): void {
    this.sources.update(documents =>
      documents.map(document =>
        document.id === sourceId ? { ...document, selected: checked } : document
      )
    );
  }

  copyAllMessages(): void {
    if (!this.messages().length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No Messages',
        detail: 'Start a chat before copying the conversation.',
        life: 2500
      });
      return;
    }

    const conversation = this.messages()
      .map(message => `[${message.role.toUpperCase()}]: ${this.stripBold(message.text)}`)
      .join('\n\n');

    navigator.clipboard.writeText(conversation).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Copied',
        detail: 'Conversation copied to clipboard.',
        life: 2500
      });
    });
  }

  exportConversation(): void {
    if (!this.messages().length) {
      this.messageService.add({
        severity: 'info',
        summary: 'No Messages',
        detail: 'Start a chat before exporting the conversation.',
        life: 2500
      });
      return;
    }

    const transcript = this.messages()
      .map(message => `[${message.role.toUpperCase()}] ${this.stripBold(message.text)}`)
      .join('\n\n');

    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `curator-chat-${Date.now()}.txt`;
    link.click();

    URL.revokeObjectURL(url);

    this.messageService.add({
      severity: 'info',
      summary: 'Exported',
      detail: 'Conversation saved as a text file.',
      life: 2500
    });
  }

  viewSourceDoc(event: MouseEvent, sourceDocuments?: string[]): void {
    event.stopPropagation();

    const documents = sourceDocuments?.length
      ? sourceDocuments
      : this.selectedSourceNames();

    this.messageService.add({
      severity: 'info',
      summary: 'Conversation Sources',
      detail: documents.length
        ? documents.join(', ')
        : 'No source documents were recorded for this message.',
      life: 2500
    });
  }

  renderBold(text: string): SafeHtml {
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const html = escapedText
      .replace(/\n/g, '<br />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  getRelevanceColor(relevance: number): string {
    if (relevance >= 90) {
      return 'relevance--high';
    }

    if (relevance >= 75) {
      return 'relevance--mid';
    }

    return 'relevance--low';
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

  private loadSourceDocuments(): void {
    this.isLoadingSources.set(true);
    this.sourceLoadError.set(null);

    this.documentsService.listDocuments().subscribe({
      next: response => {
        const mappedSources = response.map((document, index) =>
          this.mapSourceDoc(document, index)
        );

        this.sources.set(mappedSources);
        this.isLoadingSources.set(false);
        this.applyPendingDocumentSelection();
      },
      error: (error: unknown) => {
        this.sources.set([]);
        this.sourceLoadError.set(
          this.getErrorMessage(error, 'Could not load documents.')
        );
        this.isLoadingSources.set(false);
      }
    });
  }

  private loadConversationHistory(): void {
    this.isLoadingHistory.set(true);
    this.historyLoadError.set(null);

    this.chatService.listConversations().subscribe({
      next: response => {
        this.conversations.set(response);
        this.isLoadingHistory.set(false);
      },
      error: (error: unknown) => {
        this.conversations.set([]);
        this.historyLoadError.set(
          this.getErrorMessage(error, 'Could not load saved conversations.')
        );
        this.isLoadingHistory.set(false);
      }
    });
  }

  private mapSourceDoc(document: ApiDocumentRecord, index: number): SourceDoc {
    const name = this.getDocumentName(document, index);

    return {
      id: String(document.id ?? `${name}-${index}`),
      name,
      icon: this.getDocIcon(name),
      reference: this.buildReference(document),
      relevance: Math.max(65, 100 - index * 7),
      selected: false
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

  private buildReference(document: ApiDocumentRecord): string {
    const status = this.mapStatusLabel(document.status);
    const updatedAt = this.formatUpdatedAt(
      document.uploaded_at ?? document.created_at ?? document.updated_at
    );

    return `${status} | ${updatedAt}`;
  }

  private mapStatusLabel(status?: string): string {
    const normalizedStatus = status?.toLowerCase() ?? '';

    if (normalizedStatus.includes('error') || normalizedStatus.includes('fail')) {
      return 'Error';
    }

    if (
      normalizedStatus.includes('process') ||
      normalizedStatus.includes('pending') ||
      normalizedStatus.includes('queue')
    ) {
      return 'Processing';
    }

    return 'Indexed';
  }

  private formatUpdatedAt(value?: string): string {
    if (!value) {
      return 'Recently updated';
    }

    const parsedDate = new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(parsedDate);
  }

  private getDocIcon(name: string): string {
    const extension = name.split('.').pop()?.toLowerCase();

    switch (extension) {
      case 'pdf':
        return 'pi pi-file-pdf';
      case 'csv':
      case 'xlsx':
      case 'xls':
        return 'pi pi-table';
      case 'doc':
      case 'docx':
        return 'pi pi-file-word';
      default:
        return 'pi pi-file';
    }
  }

  private mapConversationMessage(message: ChatConversationMessage): ChatMessage {
    return {
      id: message.id,
      role: message.role,
      text: message.text,
      timestamp: new Date(message.timestamp),
      verified: message.role === 'ai',
      hasSourceLink: !!message.source_documents?.length,
      sourceDocuments: message.source_documents ?? []
    };
  }

  private buildConversationSummary(
    conversation: ChatConversationDetail
  ): ChatConversationSummary {
    return {
      id: conversation.id,
      title: conversation.title,
      last_message_preview: conversation.last_message_preview,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      turn_count: conversation.turn_count
    };
  }

  private selectConversationDocuments(conversation: ChatConversationDetail): void {
    const latestMessageWithSources = [...conversation.messages]
      .reverse()
      .find(message => message.role === 'ai' && message.source_documents?.length);

    if (!latestMessageWithSources?.source_documents?.length) {
      return;
    }

    this.selectDocumentsByName(latestMessageWithSources.source_documents);
  }

  private selectDocumentsByName(documentNames: string[]): void {
    const normalizedNames = [...new Set(documentNames.filter(Boolean))];

    if (!this.sources().length) {
      this.pendingSelectedDocumentNames = normalizedNames;
      return;
    }

    const selectedNames = new Set(normalizedNames);
    this.sources.update(documents =>
      documents.map(document => ({
        ...document,
        selected: selectedNames.has(document.name)
      }))
    );
  }

  private applyPendingDocumentSelection(): void {
    if (!this.pendingSelectedDocumentNames) {
      return;
    }

    const documentNames = [...this.pendingSelectedDocumentNames];
    this.pendingSelectedDocumentNames = null;
    this.selectDocumentsByName(documentNames);
  }

  private upsertConversation(conversation: ChatConversationSummary): void {
    this.conversations.update(conversations => [
      conversation,
      ...conversations.filter(item => item.id !== conversation.id)
    ]);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (typeof error === 'object' && error !== null) {
      const httpError = error as {
        message?: string;
        error?: { detail?: string; message?: string } | string;
      };

      if (typeof httpError.error === 'string' && httpError.error.trim()) {
        return httpError.error;
      }

      if (typeof httpError.error === 'object' && httpError.error !== null) {
        const errorDetail = httpError.error.detail ?? httpError.error.message;
        if (typeof errorDetail === 'string' && errorDetail.trim()) {
          return errorDetail;
        }
      }

      if (typeof httpError.message === 'string' && httpError.message.trim()) {
        return httpError.message;
      }
    }

    return fallback;
  }

  private updateMessage(
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage
  ): void {
    this.messages.update(messages =>
      messages.map(message =>
        message.id === messageId ? updater(message) : message
      )
    );
  }

  private scrollToBottom(): void {
    try {
      const element = this.chatScroll.nativeElement;
      element.scrollTop = element.scrollHeight;
    } catch {
      // noop
    }
  }

  private stripBold(text: string): string {
    return text.replace(/\*\*(.*?)\*\*/g, '$1');
  }
}
