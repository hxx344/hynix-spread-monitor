# 海力士 ADR 价差

中文行情看板：溢价率、美元价差、同口径价格对比；支持一周、一月、全部历史及最近每日观察。

## 运行

Node.js 22.13+，使用 npm 锁文件。

```sh
npm run install:ci
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

开发地址为 http://localhost:5173/ 。无需 API 密钥。

## 数据口径

- 数据源：Hyperliquid `/info` 的 `candleSnapshot`，1 小时已完成 K 线收盘价。
- `xyz:SKHX`：trade[XYZ] 的韩国正股永续合约，已将一股 KRX 000660 的韩元价格折为美元。
- `xyz:SKHY`：trade[XYZ] 的 Nasdaq ADR 永续合约，一份 ADS 的美元价格。
- 1 股正股 = 10 份 ADR。正股折算价 = SKHX / 10；每份价差 = SKHY − SKHX / 10；溢价率 = (SKHY / (SKHX / 10) − 1) × 100%。
- ADR 首日为 2026-07-10（临时代码 SKHYV）；2026-07-13 起为 SKHY。图表从首日开盘后的第一个完整小时 2026-07-10 14:00 UTC 开始，排除盘前合约交易和开盘前半小时。
- 两资产按相同 UTC 小时起点对齐。无前向填充，缺失时段为断点。区间均值是可用小时溢价率的算术平均。
- 这是永续合约价差，包含合约基差、休市定价及结算币种影响，不是 KRX / Nasdaq 现货价差。

## 历史与容错

`data/archive.json` 保存真实公开 API 的已完成小时线及获取时间。服务端并行请求两个合约，与历史按时间戳合并，响应结果缓存 60 秒。任一接口失败时成对回退到历史快照，缓存 15 秒，页面明确显示保存时间。共同小时超过两小时未更新或历史缺失时会提示。

Hyperliquid 仅保留最近 5,000 根各周期 K 线（小时线约 208 天）。当前部署包含自上市至 2026-09-11 的档案；运行时新增数据仅在内存中缓存，不会写回部署文件。长期使用应在 208 天窗口结束前定期执行以下命令并重新部署，否则超出档案与接口窗口之间的历史会显示为缺口。

```sh
npm run data:archive
```

脚本仅在两边数据都成功通过验证后原子更新档案，保留已有历史。未配置定时任务。

## 官方资料

- [SK hynix 上市公告](https://news.skhynix.com/en/skhynix-lists-adrs-on-nasdaq/)
- [Citi ADR 比例 1:10](https://depositaryreceipts.citi.com/adr/guides/pgm_dispabook.aspx?cusip=78392B206&pageId=15&subpageID=111)
- [SEC F-6](https://www.sec.gov/Archives/edgar/data/2120882/000119380526000898/e665622_f6-skhynix.htm)
- [XYZ 合约规格](https://docs.trade.xyz/perpetuals/specifications-and-schedules/specification-index)
- [XYZ 韩国股票换汇](https://docs.trade.xyz/perpetuals/markets/stocks/korea)
- [Hyperliquid API 与历史上限](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)

## 技术结构

React / TypeScript / Recharts；Vinext + Vite；Cloudflare Worker 提供 `/api/market`，站点配置位于 `.openai/hosting.json`。

`lib/market.ts` 实现对齐和计算，`lib/market-service.ts` 实现取数与容错。测试覆盖换算比例、折价、异常及未完成 K 线、重叠历史去重、时间筛选、离线回退和单边接口失败。
