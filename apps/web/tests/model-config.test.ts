import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyModelConfig,
  normalizeModelConfig,
  validateModelConfig,
} from '../src/shared/model-config/modelConfig.ts';

test('model configuration allows neither provider or either provider independently', () => {
  const empty = emptyModelConfig();
  assert.deepEqual(validateModelConfig(empty), {});
  const config = emptyModelConfig();
  config.music = {
    baseUrl: 'https://music.example.com/v1',
    model: 'music-model',
    apiKey: 'sk-test-only-123',
  };
  assert.deepEqual(validateModelConfig(config), {});
  assert.equal(empty.music.baseUrl, '');
});
test('partly filled providers report their own missing address or model', () => {
  const config = emptyModelConfig();
  config.language.apiKey = 'test-only';
  config.music.baseUrl = 'https://music.example.com';
  const errors = validateModelConfig(config);
  assert.ok(errors.language);
  assert.ok(errors.music);
});
test('service addresses reject unsupported protocols and embedded credentials', () => {
  for (const baseUrl of [
    'javascript:alert(1)',
    'file:///tmp/api',
    'https://user:secret@example.com',
    'https://example.com?key=secret',
    'https://example.com#secret',
    'example.com',
  ]) {
    const config = emptyModelConfig();
    config.language = { baseUrl, model: 'test', apiKey: '' };
    assert.ok(validateModelConfig(config).language);
  }
  for (const baseUrl of ['http://127.0.0.1:8080/v1', 'http://api.example.com/v1']) {
    const config = emptyModelConfig();
    config.language = { baseUrl, model: 'local', apiKey: 'sk-test-only-123' };
    assert.ok(validateModelConfig(config).language, 'our server calls https only');
  }
  const missingKey = emptyModelConfig();
  missingKey.language = { baseUrl: 'https://api.example.com/v1', model: 'm', apiKey: '' };
  assert.ok(validateModelConfig(missingKey).language);
});
test('normalization trims configuration without mutating the editor draft', () => {
  const draft = emptyModelConfig();
  draft.language = { baseUrl: ' https://example.com/v1 ', model: ' model ', apiKey: ' test-only ' };
  const config = normalizeModelConfig(draft);
  assert.deepEqual(config.language, {
    baseUrl: 'https://example.com/v1',
    model: 'model',
    apiKey: 'test-only',
  });
  assert.equal(draft.language.model, ' model ');
});
