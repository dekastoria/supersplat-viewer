import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { renderViewerHtml } from '../dist/index.js';

const root = new URL('../src/', import.meta.url);
const en = JSON.parse(readFileSync(new URL('locales/en.json', root)));

test('Indonesian native dictionary has every English key and no blank translation', () => {
    const file = new URL('locales/id.json', root);
    assert.ok(existsSync(file), 'Indonesian native dictionary is missing');
    const id = JSON.parse(readFileSync(file));
    assert.deepEqual(Object.keys(id).sort(), Object.keys(en).sort());
    assert.ok(Object.values(id).every((value) => typeof value === 'string' && value.trim()));
});

function localization(languages) {
    const source = readFileSync(new URL('localization.ts', root), 'utf8').replace(
        /import (\w+) from '(.+\.json)';/g,
        (_, name, path) => `const ${name} = ${readFileSync(new URL(path, root), 'utf8')};`
    );
    const attributes = {};
    const label = {
        dataset: { i18nAriaLabel: 'tooltip.settings' },
        setAttribute: (key, value) => {
            attributes[key] = value;
        }
    };
    const loading = {
        textContent: '',
        setAttribute: (key, value) => {
            attributes[key] = value;
        }
    };
    const document = {
        documentElement: {},
        querySelectorAll: (selector) => (selector === '[data-i18n-aria-label]' ? [label] : []),
        getElementById: (id) => (id === 'loadingText' ? loading : { classList: { add() {}, remove() {} } })
    };
    const context = vm.createContext({ exports: {}, navigator: { languages, language: languages[0] }, document });
    vm.runInContext(
        ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
        context
    );
    return { api: context.exports, document, attributes, loading };
}

test('explicit English overrides Indonesian and French browser preferences', () => {
    const { api, document } = localization(['id-ID', 'fr-FR']);
    api.initLocalization('en');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(api.localize('tooltip.settings'), 'Settings');
});

test('explicit Indonesian overrides English browser preferences and localizes aria/error', () => {
    const { api, document, attributes, loading } = localization(['en-US']);
    api.initLocalization('id');
    assert.equal(document.documentElement.lang, 'id');
    assert.equal(api.localize('tooltip.settings'), 'Pengaturan');
    assert.equal(attributes['aria-label'], 'Pengaturan');
    api.showLoadError();
    assert.equal(loading.textContent, 'Tur gagal dimuat. Muat ulang halaman untuk mencoba lagi.');
    assert.equal(attributes.role, 'alert');
});

test('standalone caller without lang retains native browser detection', () => {
    const { api, document } = localization(['id-ID', 'en-US']);
    api.initLocalization();
    assert.equal(document.documentElement.lang, 'id');
});

test('native icon buttons have localized accessible labels and startup catches loading errors', () => {
    const html = readFileSync(new URL('index.html', root), 'utf8');
    for (const button of html.matchAll(/<button\b[^>]*>/g)) {
        assert.match(button[0], /data-i18n(?:-aria-label)?=/, button[0]);
    }
    assert.match(html, /catch\s*\(error\)[\s\S]*show(?:Viewer)?LoadError\(\)/);
    const index = readFileSync(new URL('index.ts', root), 'utf8');
    assert.match(index, /gsplatLoad\.catch\([\s\S]*showLoadError\(\)/);
});

test('inlineJs executes localization and catches rejected settings using the same main binding', async () => {
    const rendered = renderViewerHtml({ inlineJs: true });
    const script = [...rendered.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].at(-1)[1];
    const loading = { textContent: '', setAttribute() {} };
    let ready;
    const document = {
        documentElement: {},
        querySelectorAll: () => [],
        getElementById: (id) => (id === 'loadingText' ? loading : { classList: { add() {}, remove() {} } }),
        addEventListener: (name, callback) => {
            if (name === 'DOMContentLoaded') ready = callback;
        }
    };
    const window = {
        sse: {
            config: { lang: 'id' },
            settings: {
                then(_resolve, reject) {
                    reject(new Error('settings fixture failure'));
                }
            }
        }
    };
    const context = vm.createContext({
        window,
        document,
        navigator: { languages: ['en-US'], language: 'en-US', userAgent: 'test' },
        console: { log() {}, error() {} },
        setTimeout,
        clearTimeout,
        performance,
        TextDecoder,
        TextEncoder,
        URL
    });
    // Only remove the module export statement; execute the complete shipped inline bundle and bootstrap.
    vm.runInContext(script.replace(/^export \{[^\n]+\};$/gm, ''), context);
    assert.equal(typeof ready, 'function');
    await ready();
    assert.equal(document.documentElement.lang, 'id');
    assert.equal(loading.textContent, 'Tur gagal dimuat. Muat ulang halaman untuk mencoba lagi.');
});
