import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);
const uiSource = readFileSync(new URL('ui.ts', sourceRoot), 'utf8');
const stylesSource = readFileSync(new URL('index.scss', sourceRoot), 'utf8');

test('DekaHobby MVP keeps AR and VR controls hidden globally', () => {
    assert.match(uiSource, /const XR_ENABLED = false/);
    assert.match(uiSource, /XR_ENABLED\s*&&\s*state\.hasAR/);
    assert.match(uiSource, /XR_ENABLED\s*&&\s*state\.hasVR/);
});

test('annotation arrows scale with the viewport while retaining a bounded size', () => {
    const annotationButtons = stylesSource.match(/#annotationNav[\s\S]*?\n\}\n/iu)?.[0] ?? '';
    assert.match(annotationButtons, /width:\s*clamp\(/);
    assert.match(annotationButtons, /height:\s*clamp\(/);
    assert.match(annotationButtons, /max-width:\s*calc\(100vw/);
});
