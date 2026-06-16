import type { Proxy } from '../proxy';

export type PerformResult = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  status: number;
  statusText: string;
  headers: Headers;
  initialBytes: Uint8Array;
};

export interface ExecutorState {
  proxy: Proxy;
  request: Request;
  signal?: AbortSignal;
  redirectMode: string;
  bodyBytes?: Uint8Array;
  redirected: boolean;
}
