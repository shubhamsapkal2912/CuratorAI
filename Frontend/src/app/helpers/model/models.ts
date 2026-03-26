// models/camera.model.ts
export interface Camera {
  id: number;
  name: string;
  rtsp_url: string;
  location: string;
  status: 'active' | 'inactive' | 'maintenance';
  created_at: string;
}

export interface CameraListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Camera[];
}
export interface CameraDetailResponse {
  total_cameras: number;
  active_cameras: number;
  inactive_cameras: number;
  maintenance_cameras: number;
}
export interface CameraCreatePayload {
  name: string;
  rtsp_url: string;
  location: string;
  status?: 'active' | 'inactive' | 'maintenance';
}

export interface CameraStatusCounts {
  active: number;
  inactive: number;
  maintenance: number;
}

export interface MLModelAnalytics {
  id: number;
  name: string;
  total_violations: number;
}

export interface ViolationAnalytics {
  total_violations: number;
  ml_models: MLModelAnalytics[];
}