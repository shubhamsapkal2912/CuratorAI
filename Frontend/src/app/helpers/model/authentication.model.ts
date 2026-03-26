// helpers/model/authentication.model.ts
export interface LoginPayload {
  email: string;
  password: string;
}

export interface LoginResponse {
  access?: string;
  refresh?: string;
  name?: string;  
  email?: string;  
}


