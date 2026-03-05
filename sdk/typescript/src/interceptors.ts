export type RequestInterceptor = (config: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}) => {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
};

export type ResponseInterceptor = (response: {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}) => {
  status: number;
  headers: Record<string, string>;
  data: unknown;
};

export interface InterceptorManager {
  request: RequestInterceptor[];
  response: ResponseInterceptor[];
  addRequest(interceptor: RequestInterceptor): number;
  addResponse(interceptor: ResponseInterceptor): number;
  removeRequest(index: number): void;
  removeResponse(index: number): void;
}

export function createInterceptorManager(): InterceptorManager {
  const request: RequestInterceptor[] = [];
  const response: ResponseInterceptor[] = [];

  return {
    request,
    response,
    addRequest(interceptor: RequestInterceptor): number {
      return request.push(interceptor) - 1;
    },
    addResponse(interceptor: ResponseInterceptor): number {
      return response.push(interceptor) - 1;
    },
    removeRequest(index: number): void {
      request.splice(index, 1);
    },
    removeResponse(index: number): void {
      response.splice(index, 1);
    },
  };
}