import { test } from 'node:test';
import assert from 'node:assert/strict';

const { pathForTab, tabForPath } = await import('../src/utils/routes.ts');

test('each page has its own URL and the URL maps back to the page', () => {
  for (const tab of ['map', 'discover', 'notifications', 'profile', 'business', 'settings', 'setup']) {
    assert.equal(tabForPath(pathForTab(tab)), tab);
  }
  assert.equal(pathForTab('map'), '/');
  assert.equal(pathForTab('notifications'), '/alerts');
});

test('create is a dialog, not a page', () => {
  assert.equal(pathForTab('create'), null);
});

test('trailing slashes, the /map alias and unknown or missing paths all fall back sensibly', () => {
  assert.equal(tabForPath('/discover/'), 'discover');
  assert.equal(tabForPath('/map'), 'map');
  assert.equal(tabForPath('/nope'), 'map');
  assert.equal(tabForPath(null), 'map');
  assert.equal(tabForPath(undefined), 'map');
});

test('settings, business and setup are real pages with their own URLs', () => {
  assert.equal(pathForTab('settings'), '/settings');
  assert.equal(pathForTab('business'), '/business');
  assert.equal(pathForTab('setup'), '/setup');
  assert.equal(tabForPath('/setup/'), 'setup');
});
