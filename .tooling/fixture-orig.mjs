/**
 * 自检夹具的**唯一判据**（原始名 → 是不是测试造出来的夹具）。
 *
 * ── 为什么单独一个文件 ──────────────────────────────────────────────
 * 这个判据有**两个消费方**，且两边都必须一模一样：
 *   · `.tooling/sweep-selfcheck.mjs`     —— 把夹具搬进隔离区、清索引
 *   · `.tooling/sync-incremental.mjs`    —— 上线前守卫「素材库没被夹具污染」
 * 2026-10-13 实测：两边各自写了一份 `/^selfcheck-/`，于是
 *   · sweep 漏掉了 7 个 `ui-test-*` / `from-json.*` 夹具（还留在索引里）；
 *   · sync 的守卫对着同一批夹具**报「素材库没有被自检夹具污染」**——假绿。
 * 两处口径必须同源，所以抽到这里。**新增夹具命名时只改这一处。**
 *
 * ── 判定口径 ───────────────────────────────────────────────────────
 *   · `selfcheck-*`            —— `server/tools/check-all.mjs` 造的上传夹具
 *   · `ui-test-<6位hex>.<ext>` —— UI 测试（`test-media-ui.mjs`）走**界面**上传的夹具
 *   · `from-json.<ext>`        —— 同一测试的「从 JSON 上传」通道
 * 一律**锚定开头 + 硬结构**。**不要放宽成「名字里含 test / xx」**：
 * 有赞导入的真素材原始名里大量含 `xx`（如
 * `FmDkS1V0NxxGJOk8266ZqYXV3vn6.png!middle.webp`），放宽会把真素材误伤。
 *
 * ⚠️ 漏判的代价不只是「本机多几条」—— 这些条目会随 `sync-incremental --apply`
 * **推上线上素材库**（公开可 GET，且出现在运营的素材列表里）。
 */
export const FIXTURE_ORIG = [/^selfcheck-/i, /^ui-test-[0-9a-f]{6}\./i, /^from-json\./i];

/** 原始名是不是夹具 */
export function isFixtureOrig(orig) {
  const o = String(orig || '');
  return FIXTURE_ORIG.some((re) => re.test(o));
}

/** 索引入口：条目（形如 {name, orig, …}）是不是夹具 */
export function isFixtureItem(it) {
  return isFixtureOrig(it && it.orig);
}
