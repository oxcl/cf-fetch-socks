import {
	buildRequest,
	drainBodyStream,
	performRequest,
} from './request';
import {
	parseResponseHeaders,
	readHeaders,
	streamResponse,
	buildFinalResponse,
} from './response';
import {
	drainReader,
	createChunkedDecodingStream,
	createDecompressionStream,
	createPlainStream,
} from './stream';
import {
	buildManualResponse,
	throwRedirectError,
	buildNoLocationResponse,
	buildTooManyRedirectsResponse,
} from './response-builders';
import { isRedirect } from './utils';

export const http = {
	buildRequest,
	drainBodyStream,
	performRequest,
	parseResponseHeaders,
	readHeaders,
	streamResponse,
	buildFinalResponse,
	drainReader,
	createChunkedDecodingStream,
	createDecompressionStream,
	createPlainStream,
	buildManualResponse,
	throwRedirectError,
	buildNoLocationResponse,
	buildTooManyRedirectsResponse,
	isRedirect,
};
