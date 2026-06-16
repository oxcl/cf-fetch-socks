import { AbortError } from '../errors';
import { debug } from '../debug';
import { MAX_REDIRECT } from '../constants';
import { drainBodyStream } from '../http/request';
import { buildFinalResponse } from '../http/response';
import type { Proxy } from '../proxy';
import type { ExecutorState } from './types';
import { connect, perform, releaseConnection } from './connection';
import { buildNextRequest, drainAndGetLocation } from './redirect';
import { isRedirect } from './utils';
import {
  buildHeadResponse,
  buildManualResponse,
  throwRedirectError,
  buildNoLocationResponse,
  buildTooManyRedirectsResponse,
} from './response';

export type { PerformResult } from './types';

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortError('The operation was aborted');
}

export async function execute(proxy: Proxy, request: Request, signal?: AbortSignal): Promise<Response> {
  const state: ExecutorState = {
    proxy,
    request,
    signal,
    redirectMode: request.redirect || 'follow',
    bodyBytes: undefined,
    redirected: false,
  };

  for (let i = 0; i < MAX_REDIRECT; i++) {
    checkAborted(state.signal);
    if (i > 0) debug.log(`Redirect #${i}: ${state.request.method} ${state.request.url}`);

    const url = new URL(state.request.url);
    if (state.request.body && !state.bodyBytes) {
      state.bodyBytes = await drainBodyStream(state.request.body);
    }

    const conn = await connect(state.proxy, url, state.signal);

    try {
      const result = await perform(conn, state.request, state.bodyBytes, state.signal);

      if (state.request.method === 'HEAD') return buildHeadResponse(state.proxy, conn, result);
      if (!isRedirect(result.status)) return buildFinalResponse(conn, result, state.redirected, state.request.url, state.signal);
      if (state.redirectMode === 'manual') return buildManualResponse(state.proxy, conn, result);
      if (state.redirectMode === 'error') throwRedirectError(conn, result);

      state.redirected = true;

      const location = await drainAndGetLocation(result);
      if (!location) return buildNoLocationResponse(state.proxy, conn, result);

      buildNextRequest(state, result, location, url);
      releaseConnection(state.proxy, conn, result);
    } catch (e) {
      debug.log(`Error: ${e instanceof Error ? e.message : String(e)}`);
      conn.close();
      if (state.signal?.aborted) throw new AbortError('The operation was aborted');
      throw e;
    }
  }

  return buildTooManyRedirectsResponse();
}
