import { Injectable, OnDestroy } from '@angular/core';
import { Subject, Observable }   from 'rxjs';

// ✅ Added 'type' field that was missing
export interface CameraFrame {
  type:      string;
  camera_id: number;
  frame:     string;   // base64 JPEG
}

@Injectable({ providedIn: 'root' })
export class CameraStreamService implements OnDestroy {

  private sockets  = new Map<number, WebSocket>();
  private subjects = new Map<number, Subject<string>>();

  connectCamera(cameraId: number): Observable<string> {
    if (this.subjects.has(cameraId)) {
      return this.subjects.get(cameraId)!.asObservable();
    }

    const subject = new Subject<string>();
    const ws      = new WebSocket(`ws://localhost:8000/ws/camera/${cameraId}/`);

    ws.onopen = () =>
      console.log(`[WS] Connected → camera ${cameraId}`);

    ws.onmessage = (event) => {
      const data: CameraFrame = JSON.parse(event.data);
      if (data.type === 'frame') {                          // ✅ now valid
        subject.next(`data:image/jpeg;base64,${data.frame}`);
      }
    };

    ws.onerror = (e) =>
      console.error(`[WS] Camera ${cameraId} error`, e);

    ws.onclose = () => {
      console.log(`[WS] Camera ${cameraId} disconnected`);
      subject.complete();
      this.sockets.delete(cameraId);
      this.subjects.delete(cameraId);
    };

    this.sockets.set(cameraId,  ws);
    this.subjects.set(cameraId, subject);

    return subject.asObservable();
  }

  disconnectCamera(cameraId: number): void {
    this.sockets.get(cameraId)?.close();
  }

  ngOnDestroy(): void {
    this.sockets.forEach(ws => ws.close());
  }
}
