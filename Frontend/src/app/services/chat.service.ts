import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthenticationService } from './authentication.service';
import { ConfigService } from './config.service';

export interface ChatAskResponse {
  answer: string;
  conversation?: ChatConversationSummary;
  raw: unknown;
}

export interface ChatConversationSummary {
  id: string;
  title: string;
  last_message_preview: string;
  created_at: string;
  updated_at: string;
  turn_count: number;
}

export interface ChatConversationMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
  source_documents?: string[];
}

export interface ChatConversationDetail extends ChatConversationSummary {
  messages: ChatConversationMessage[];
}

export interface ChatStreamEvent {
  type: 'start' | 'chunk' | 'complete';
  answer: string;
  conversation?: ChatConversationSummary;
  conversationId?: string | null;
  chunk?: string;
  raw?: unknown;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  constructor(
    private configService: ConfigService,
    private authenticationService: AuthenticationService
  ) {}

  askQuestion(
    query: string,
    documents: string[],
    conversationId?: string | null
  ): Observable<ChatAskResponse> {
    const payload = this.buildPayload(query, documents, conversationId);

    return this.configService.post('api/chat/ask/', payload).pipe(
      map(response => this.normalizeAskResponse(response))
    );
  }

  askQuestionStream(
    query: string,
    documents: string[],
    conversationId?: string | null
  ): Observable<ChatStreamEvent> {
    const payload = this.buildPayload(query, documents, conversationId);
    const url = this.configService.resolveUrl('api/chat/ask/stream/');

    return new Observable<ChatStreamEvent>(observer => {
      const controller = new AbortController();

      void this.streamResponse(url, payload, observer, controller);

      return () => controller.abort();
    });
  }

  listConversations(): Observable<ChatConversationSummary[]> {
    return this.configService.get('api/chat/conversations/').pipe(
      map(response => Array.isArray(response) ? response : [])
    );
  }

  getConversation(conversationId: string): Observable<ChatConversationDetail> {
    return this.configService.get(`api/chat/conversations/${conversationId}/`);
  }

  private buildPayload(
    query: string,
    documents: string[],
    conversationId?: string | null
  ) {
    const normalizedDocuments = documents
      .map(document => document.trim())
      .filter(Boolean);

    const payload: {
      query: string;
      documents: string;
      conversation_id?: string;
    } = {
      query: query.trim(),
      documents: normalizedDocuments.join(', ')
    };

    if (conversationId) {
      payload.conversation_id = conversationId;
    }

    return payload;
  }

  private normalizeAskResponse(response: any): ChatAskResponse {
    const answer =
      response?.answer ??
      response?.response ??
      response?.message ??
      response?.result ??
      response?.data?.answer ??
      response?.data?.response ??
      (typeof response === 'string' ? response : JSON.stringify(response));

    return {
      answer,
      conversation: response?.conversation,
      raw: response
    };
  }

  private async streamResponse(
    url: string,
    payload: { query: string; documents: string; conversation_id?: string },
    observer: {
      next: (value: ChatStreamEvent) => void;
      error: (error: unknown) => void;
      complete: () => void;
    },
    controller: AbortController
  ): Promise<void> {
    let accumulatedAnswer = '';

    try {
      const headers = new Headers({
        'Content-Type': 'application/json',
        Accept: 'text/event-stream, application/json'
      });

      const token = this.authenticationService.getToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await this.readErrorResponse(response));
      }

      if (!response.body) {
        throw new Error('The chat service did not return a readable stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

        let separatorIndex = this.findEventSeparator(buffer);
        while (separatorIndex !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + this.getSeparatorLength(buffer, separatorIndex));

          const event = this.parseSseEvent(rawEvent);
          if (event) {
            const shouldStop = this.handleStreamEvent(
              event,
              accumulatedAnswer,
              observer,
              updatedAnswer => {
                accumulatedAnswer = updatedAnswer;
              }
            );

            if (shouldStop) {
              return;
            }
          }

          separatorIndex = this.findEventSeparator(buffer);
        }

        if (done) {
          break;
        }
      }

      const trailingEvent = this.parseSseEvent(buffer);
      if (trailingEvent) {
        const shouldStop = this.handleStreamEvent(
          trailingEvent,
          accumulatedAnswer,
          observer,
          updatedAnswer => {
            accumulatedAnswer = updatedAnswer;
          }
        );

        if (shouldStop) {
          return;
        }
      }

      observer.next({
        type: 'complete',
        answer: accumulatedAnswer,
        conversation: undefined,
        conversationId: null,
        raw: {
          type: 'complete',
          answer: accumulatedAnswer
        }
      });
      observer.complete();
    } catch (error) {
      if (!controller.signal.aborted) {
        observer.error(error);
      }
    }
  }

  private handleStreamEvent(
    event: any,
    accumulatedAnswer: string,
    observer: {
      next: (value: ChatStreamEvent) => void;
      error: (error: unknown) => void;
      complete: () => void;
    },
    setAccumulatedAnswer: (value: string) => void
  ): boolean {
    const eventType = String(event?.type ?? '').toLowerCase();

    if (eventType === 'start') {
      observer.next({
        type: 'start',
        answer: accumulatedAnswer,
        conversationId:
          typeof event?.conversation_id === 'string' ? event.conversation_id : null,
        raw: event
      });
      return false;
    }

    if (eventType === 'chunk') {
      const chunk = typeof event?.content === 'string' ? event.content : '';
      if (!chunk) {
        return false;
      }

      const nextAnswer = accumulatedAnswer + chunk;
      setAccumulatedAnswer(nextAnswer);
      observer.next({
        type: 'chunk',
        chunk,
        answer: nextAnswer,
        raw: event
      });
      return false;
    }

    if (eventType === 'complete') {
      const finalAnswer =
        typeof event?.answer === 'string' && event.answer.length > 0
          ? event.answer
          : accumulatedAnswer;

      setAccumulatedAnswer(finalAnswer);
      const normalizedConversation = this.normalizeConversation(event?.conversation);
      observer.next({
        type: 'complete',
        answer: finalAnswer,
        conversation: normalizedConversation,
        conversationId: normalizedConversation?.id ?? null,
        raw: event
      });
      observer.complete();
      return true;
    }

    if (eventType === 'error') {
      throw new Error(this.getStreamErrorMessage(event));
    }

    return false;
  }

  private parseSseEvent(rawEvent: string): any | null {
    const dataLines = rawEvent
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim());

    if (!dataLines.length) {
      return null;
    }

    const payload = dataLines.join('\n');

    try {
      return JSON.parse(payload);
    } catch {
      return {
        type: 'chunk',
        content: payload
      };
    }
  }

  private findEventSeparator(buffer: string): number {
    const windowsSeparator = buffer.indexOf('\r\n\r\n');
    const unixSeparator = buffer.indexOf('\n\n');

    if (windowsSeparator === -1) {
      return unixSeparator;
    }

    if (unixSeparator === -1) {
      return windowsSeparator;
    }

    return Math.min(windowsSeparator, unixSeparator);
  }

  private getSeparatorLength(buffer: string, separatorIndex: number): number {
    return buffer.slice(separatorIndex, separatorIndex + 4) === '\r\n\r\n' ? 4 : 2;
  }

  private async readErrorResponse(response: Response): Promise<string> {
    const fallback = 'I could not get a response from the chat service.';
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const payload = await response.json();
      return this.getStreamErrorMessage(payload, fallback);
    }

    const text = await response.text();
    const normalizedText = text.trim();

    if (!normalizedText) {
      return fallback;
    }

    try {
      return this.getStreamErrorMessage(JSON.parse(normalizedText), fallback);
    } catch {
      return normalizedText;
    }
  }

  private getStreamErrorMessage(payload: any, fallback = 'I could not get a response from the chat service.'): string {
    if (typeof payload?.details === 'string' && payload.details.trim()) {
      return payload.details;
    }

    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    return fallback;
  }

  private normalizeConversation(conversation: any): ChatConversationSummary | undefined {
    if (!conversation || typeof conversation !== 'object') {
      return undefined;
    }

    if (typeof conversation.id !== 'string') {
      return undefined;
    }

    return {
      id: conversation.id,
      title: String(conversation.title ?? 'New chat'),
      last_message_preview: String(conversation.last_message_preview ?? ''),
      created_at: String(conversation.created_at ?? ''),
      updated_at: String(conversation.updated_at ?? ''),
      turn_count: Number(conversation.turn_count ?? 0)
    };
  }
}
