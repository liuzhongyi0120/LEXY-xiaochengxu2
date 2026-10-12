#!/usr/bin/env node
/**
 * 「改坏验红」用的替身网关：健康检查照常通过，其余一律 404。
 *
 * 为什么需要它：`sync-incremental.mjs --verify` 新增了「素材可达性」判定，
 * 但线上现在**已经全绿**，直接跑只能看到绿 —— 按本仓库的铁律
 * （新断言必须能「改坏验红」，见 .workbuddy/memory/MEMORY.md）要证明它真的会红，
 * 且红的必须是素材那一条。做法：把 BASE 指到这个替身，
 * 让「服务在跑」通过、而所有素材都取不到，看它有没有报红并给出修法。
 *
 * 用法：node .tooling/_stub-base.mjs 3999 &
 *       LEXYSYNC_BASE=http://127.0.0.1:3999 node .tooling/sync-incremental.mjs --verify --fast
 */
import http from 'node:http';

const PORT = Number(process.argv[2] || 3999);
const REAL = process.env.STUB_REAL_BASE || 'https://14.103.50.137/mall-api';

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/health')) {
    // 健康检查转发给真线上：保证红的那条只能是「素材」
    const r = await fetch(REAL + '/api/health');
    res.writeHead(r.status, { 'content-type': 'application/json' });
    res.end(await r.text());
    return;
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ code: 404, msg: 'stub: not found', data: null }));
}).listen(PORT, '127.0.0.1', () => console.log('stub base listening on ' + PORT));
