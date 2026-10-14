import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_API_URL, resolveApiUrl, boundedHistory, prepareRequest, sourceHref,
    parseReply, errorMessage, utf8Bytes } from '../src/components/assistant/protocol.mjs';

test('service defaults to the shared backend and an empty value disables it', () => {
    assert.equal(resolveApiUrl(undefined), DEFAULT_API_URL);
    assert.equal(resolveApiUrl('  '), '');
    assert.equal(resolveApiUrl('https://assistant.example/'), 'https://assistant.example');
    assert.equal(resolveApiUrl('http://127.0.0.1:4322'), 'http://127.0.0.1:4322');
});
test('public configuration cannot contain credentials, paths, query secrets or unsafe schemes', () => {
    for (const value of ['https://name:secret@example.com', 'https://example.com/?key=secret',
        'https://example.com/#secret', 'https://example.com/api/chat', 'http://example.com',
        'javascript:alert(1)', '//example.com', 'data:text/html,test']) {
        assert.throws(() => resolveApiUrl(value), value);
    }
});
test('history keeps the latest six eligible messages in order and strips local fields', () => {
    const messages = Array.from({length: 9}, (_, i) => ({role: i % 2 ? 'assistant' : 'user', content: String(i)}));
    messages.push({role: 'assistant', content: 'local error', localOnly: true});
    assert.deepEqual(boundedHistory(messages).map(x => x.content), ['3','4','5','6','7','8']);
    assert.ok(boundedHistory(messages).every(x => !Object.hasOwn(x, 'localOnly')));
});
test('history limits use UTF-8 bytes, not JavaScript character count', () => {
    const messages = Array.from({length: 6}, () => ({role: 'assistant', content: '中'.repeat(2000)}));
    assert.equal(boundedHistory(messages).length, 4);
    assert.equal(boundedHistory([{role:'assistant', content: 'x'.repeat(8193)},
        {role:'user', content:'last'}]).length, 1);
});
test('request contains only server-supported fields and enforces the message byte boundary', () => {
    assert.deepEqual(JSON.parse(prepareRequest('  问题  ', [])), {message:'问题',history:[],lessonId:'home'});
    assert.equal(JSON.parse(prepareRequest('x'.repeat(8192), [])).message.length, 8192);
    assert.throws(() => prepareRequest('中'.repeat(2731), []));
    assert.throws(() => prepareRequest(' ', []));
});
test('JSON escaping also fits the 40000-byte transport limit without mutating history', () => {
    const history = Array.from({length: 6}, () => ({role:'user',content:'\u0000'.repeat(4000)}));
    const original = JSON.stringify(history);
    const body = prepareRequest('hello', history);
    assert.ok(utf8Bytes(body) <= 40000);
    assert.equal(JSON.stringify(history), original);
    assert.throws(() => prepareRequest('\u0000'.repeat(8192), []));
});
test('source links preserve Chinese chapter IDs on the fixed original origin', () => {
    const lesson = 'guide-3-mod-创建启用与打包第一个';
    const url = new URL(sourceHref(lesson));
    assert.equal(url.origin, DEFAULT_API_URL);
    assert.equal(decodeURIComponent(url.hash.slice(2)), lesson);
});
test('malicious source destinations never become URLs or executable schemes', () => {
    for (const value of ['javascript:alert(1)', '//evil.example', '<svg onload=alert(1)>',
        '../admin', 'guide-name?token=x', null, {}]) {
        assert.equal(sourceHref(value), `${DEFAULT_API_URL}/#/knowledge`);
    }
});
test('reply parsing requires final text and bounds optional source metadata', () => {
    for (const bad of [null, {}, {content:''}, {content:123}]) assert.throws(() => parseReply(bad));
    const reply = parseReply({content:'<img src=x onerror=alert(1)>\n{ key = yes }', sources: [null,
        ...Array.from({length:20},()=>({id:'x'.repeat(400),title:'t'.repeat(600),relatedLesson:'localisation'}))]});
    assert.equal(reply.content, '<img src=x onerror=alert(1)>\n{ key = yes }'); // Client renders with textContent.
    assert.ok(reply.sources.length <= 8);
    assert.ok(reply.sources.every(x=>x.id.length<=200 && x.title.length<=300));
});
test('public error messages have bounded length and a safe fallback', () => {
    assert.equal(errorMessage({message:'x'.repeat(2000)}).length, 1000);
    assert.match(errorMessage({message:{}}), /不会自动重试/);
});
