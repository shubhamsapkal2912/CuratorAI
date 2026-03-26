import { HttpInterceptorFn } from '@angular/common/http';

export const authenticationInterceptor: HttpInterceptorFn = (req, next) => {
  const isLoginRequest = /\/api\/user\/login\/?$/.test(req.url);
  if (isLoginRequest) {
    return next(req);
  }

  const accessToken = localStorage.getItem('access_token');
  if (!accessToken) {
    return next(req);
  }

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  return next(authReq);
};
