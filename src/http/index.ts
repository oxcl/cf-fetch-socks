import {
	buildRequest,
	performRequest,
} from './request';
import {
	parseResponseHeaders,
	readHeaders,
	streamResponse,
	buildFinalResponse,
} from './response';
import {
	createChunkedDecodingStream,
	createDecompressionStream,
	createPlainStream,
} from './stream';
import {
	buildManualResponse,
	throwRedirectError,
	buildNoLocationResponse,
	buildTooManyRedirectsResponse,
	buildNextRequest,
} from './response-builders';
import { isRedirect } from './utils';

export const http = {
	buildRequest,
	performRequest,
	parseResponseHeaders,
	readHeaders,
	streamResponse,
	buildFinalResponse,
	createChunkedDecodingStream,
	createDecompressionStream,
	createPlainStream,
	buildManualResponse,
	throwRedirectError,
	buildNoLocationResponse,
	buildTooManyRedirectsResponse,
	buildNextRequest,
	isRedirect,
};
