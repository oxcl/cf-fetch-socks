export type PerformResult = {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  status: number;
  statusText: string;
  headers: Headers;
  initialBytes: Uint8Array;
};
