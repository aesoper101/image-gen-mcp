import { expect, test } from '@rstest/core';
import { parseArgs } from '../src/config/args';

test('parses --key=value form', () => {
  expect(parseArgs(['--providers=openai,zhipu'])).toEqual({
    providers: 'openai,zhipu',
  });
});

test('parses --key value form', () => {
  expect(parseArgs(['--max-retries', '3'])).toEqual({ 'max-retries': '3' });
});

test('bare --flag parses to true', () => {
  expect(parseArgs(['--verbose'])).toEqual({ verbose: 'true' });
});

test('ignores non-flag arguments', () => {
  expect(parseArgs(['node', 'index.js', '--env', 'dev', 'extra'])).toEqual({
    env: 'dev',
  });
});
