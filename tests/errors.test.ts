import { expect, test } from '@rstest/core';
import {
  ImageGenError,
  sanitizeMessage,
  toImageGenError,
} from '../src/core/errors';

test('ImageGenError keeps its own classification', () => {
  const err = new ImageGenError('non-retryable', '401 unauthorized', {
    status: 401,
  });
  expect(toImageGenError(err)).toBe(err);
});

test('5xx / 429 map to retryable', () => {
  expect(toImageGenError({ status: 500, message: 'boom' }).kind).toBe(
    'retryable',
  );
  expect(toImageGenError({ status: 429, message: 'rate limited' }).kind).toBe(
    'retryable',
  );
});

test('4xx (except 429) map to non-retryable', () => {
  expect(toImageGenError({ status: 401, message: 'bad key' }).kind).toBe(
    'non-retryable',
  );
  expect(toImageGenError({ status: 400, message: 'bad params' }).kind).toBe(
    'non-retryable',
  );
  expect(toImageGenError({ status: 404, message: 'not found' }).kind).toBe(
    'non-retryable',
  );
});

test('network errors map to retryable', () => {
  const netErr = new Error('connect ECONNRESET');
  (netErr as Error & { code: string }).code = 'ECONNRESET';
  expect(toImageGenError(netErr).kind).toBe('retryable');
});

test('unknown errors conservatively map to retryable', () => {
  expect(toImageGenError(new Error('mystery')).kind).toBe('retryable');
  expect(toImageGenError('string error').kind).toBe('retryable');
});

test('sanitizeMessage strips sk- keys and Bearer headers', () => {
  expect(
    sanitizeMessage('request failed: sk-abcdef1234567890secret was rejected'),
  ).toContain('sk-abcdef…');
  expect(
    sanitizeMessage('Authorization: Bearer tok1234567890abcdef'),
  ).toContain('Bearer ***');
  expect(
    sanitizeMessage('Authorization: Bearer tok1234567890abcdef'),
  ).not.toContain('tok1234567890abcdef');
});
