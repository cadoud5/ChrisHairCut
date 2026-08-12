const { escapeHtml } = require('../utils/escapeHtml');

describe('escapeHtml', () => {
  test('escapes angle brackets so tags cannot be injected', () => {
    expect(escapeHtml('<script>alert(1)</script>'))
      .toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('escapes quotes so attribute breakout is not possible', () => {
    expect(escapeHtml(`x" onmouseover="alert(1)`))
      .toBe('x&quot; onmouseover=&quot;alert(1)');
    expect(escapeHtml(`x' onclick='alert(1)`))
      .toBe('x&#39; onclick=&#39;alert(1)');
  });

  test('escapes ampersands', () => {
    expect(escapeHtml('Fade & Taper')).toBe('Fade &amp; Taper');
  });

  test('passes plain text through unchanged', () => {
    expect(escapeHtml('Chris Doud')).toBe('Chris Doud');
  });

  test('handles null/undefined safely instead of throwing', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  test('coerces non-string values (e.g. numbers) to string first', () => {
    expect(escapeHtml(35)).toBe('35');
  });
});