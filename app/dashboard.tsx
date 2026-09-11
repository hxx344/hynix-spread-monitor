"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowDownRight, ArrowUpRight, ChevronDown, Clock3, Info, RefreshCw, MoveRight, BarChart3 } from "lucide-react";
import SpreadChart, { ranges } from "./spread-chart";
import { dailyPoints, selectRange, type MarketData } from "../lib/market";

const EMPTY_POINTS: never[] = [];
const money = (v: number | undefined) => v === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const percent = (v: number | undefined) => v === undefined ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
const signedMoney = (v: number | undefined) => v === undefined ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${money(Math.abs(v))}`;
const date = (t: number | string, full=false) => new Intl.DateTimeFormat("zh-CN", { timeZone:"UTC", month:"2-digit", day:"2-digit", ...(full ? {year:"numeric"} : {}) }).format(new Date(t));
const stamp = (t: number | string) => `${date(t,true)} ${new Date(t).toISOString().slice(11,16)} UTC`;

async function requestMarket(signal?: AbortSignal): Promise<MarketData> {
  const response = await fetch("/api/market", {signal});
  if (!response.ok) throw new Error("行情暂时无法加载，请稍后重试。");
  const next: MarketData = await response.json();
  if (!next.points?.length) throw new Error("暂时没有可对齐的行情数据。");
  return next;
}

export default function Dashboard() {
  const [data,setData] = useState<MarketData | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [range,setRange] = useState<number | null>(null);

  const [details,setDetails] = useState(false);
  const refresh = async () => {
    try { setData(await requestMarket()); }
    catch(e) { setError(e instanceof Error ? e.message : "行情加载失败。"); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    const controller = new AbortController();
    requestMarket(controller.signal)
      .then(next => { if (!controller.signal.aborted) setData(next); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "行情加载失败。"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  },[]);
  const points = useMemo(() => selectRange(data?.points ?? [],range),[data,range]);
  const latest = data?.points.at(-1);
  const stats = useMemo(() => {
    if(!points.length) return null;
    const values = points.map(p=>p.premium);
    return { mean: values.reduce((a,b)=>a+b,0)/values.length, min: Math.min(...values), max:Math.max(...values) };
  },[points]);
  const recent = useMemo(() => dailyPoints(points).slice(-6).reverse(),[points]);
  const direction = !latest || latest.premium >= 0 ? "positive" : "negative";
  return <div className="site-shell">
    <header className="topbar"><Link className="brand" href="/" aria-label="Hynix Spread 首页"><span className="brand-mark"><BarChart3 size={23}/></span><span>HYNIX<span className="brand-light"> / SPREAD</span></span></Link><div className="top-meta"><span>跨市场观察</span><span className="vertical-rule"/><span className="source-dot"/>Hyperliquid</div></header>
    <main>
      <div className="page-heading"><div><div className="eyebrow">SK HYNIX <span>/</span> 000660 · SKHY</div><h1>海力士 ADR 价差<span className="small-tag">上市以来</span></h1><p>正股与 ADR 同口径比较 · Hyperliquid 永续合约</p></div><button className="refresh-button" onClick={()=>{ setLoading(true); setError(""); void refresh(); }} disabled={loading}><RefreshCw size={15} className={loading ? "spinning" : ""}/>{loading ? "加载行情" : "刷新行情"}</button></div>
      <div className="data-status" role="status"><span className="status-left"><Clock3 size={14}/>{data ? `${data.status === "snapshot" ? "已保存行情" : "最新行情"} · ${latest ? stamp(latest.time + 3_600_000) : ""} 小时收盘` : "正在获取并对齐两边的小时行情…"}</span><span className="status-right">USD · 1 股正股 = 10 份 ADR</span></div>
      {error && <div className="notice error" role="alert"><Info size={16}/>{error}{data ? " 当前保留上次成功加载的数据。" : ""}</div>}
      {data?.status === "snapshot" && <div className="notice"><Info size={16}/>实时接口暂不可用，展示 {stamp(data.fetchedAt)} 获取的真实行情快照。</div>}
      {data?.warnings.map(w=><div className="notice" key={w}><Info size={16}/>{w}</div>)}
      <section className="metrics" aria-label="最新价差概览">
        <article className="metric primary-metric"><div className="metric-label">当前 ADR 溢价率<Activity size={16}/></div><div className={`metric-value ${direction}`}>{percent(latest?.premium)}</div><div className="metric-foot">每份价差 <b className={direction}>{signedMoney(latest?.spread)}</b></div></article>
        <article className="metric"><div className="metric-label"><span className="legend-dot adr"/>ADR 价格<span className="ticker">SKHY</span></div><div className="metric-value">{money(latest?.adr)}</div><div className="metric-foot">1 份 ADR <span>· xyz:SKHY</span></div></article>
        <article className="metric"><div className="metric-label"><span className="legend-dot ordinary"/>正股折算价格<span className="ticker">SKHX</span></div><div className="metric-value">{money(latest?.equivalent)}</div><div className="metric-foot">正股 {money(latest?.ordinary)} <span>÷ 10</span></div></article>
        <article className="metric"><div className="metric-label">区间平均溢价<span className="ticker">{ranges.find(r=>r.days===range)?.label}</span></div><div className="metric-value">{percent(stats?.mean)}</div><div className="metric-foot">{stats ? `${percent(stats.min)} 至 ${percent(stats.max)}` : "等待行情数据"}</div></article>
      </section>
      <SpreadChart data={data?.points ?? EMPTY_POINTS} loading={loading} range={range} onRangeChange={setRange} />
      <div className="bottom-grid"><section className="table-panel"><div className="section-heading"><h2>近期观察</h2><span>每日最后共同小时 · 起点 UTC</span></div><div className="table-scroll"><table><thead><tr><th>日期</th><th>ADR</th><th>正股 ÷ 10</th><th>每份价差</th><th>溢价率</th></tr></thead><tbody>{recent.map(p=><tr key={p.time}><td>{date(p.time,true)}<small>{new Date(p.time).toISOString().slice(11,16)}</small></td><td>{money(p.adr)}</td><td>{money(p.equivalent)}</td><td>{signedMoney(p.spread)}</td><td><span className={`premium-pill ${p.premium>=0 ? "positive" : "negative"}`}>{p.premium>=0 ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>}{percent(p.premium)}</span></td></tr>)}{!recent.length && <tr><td colSpan={5} className="empty-table">{loading ? "正在加载记录…" : "暂无记录"}</td></tr>}</tbody></table></div></section>
      <aside className="method-panel"><div className="section-heading"><h2>如何比较</h2><span className="info-icon"><Info size={17}/></span></div><div className="conversion"><div><span className="instrument-label">韩国正股</span><strong>1 <small>股</small></strong><span>000660 · KRX</span></div><MoveRight size={22}/><div><span className="instrument-label">美国 ADR</span><strong>10 <small>份</small></strong><span>SKHY · NASDAQ</span></div></div><div className="formula"><span>ADR 溢价率</span><code>(ADR ÷ (正股美元价 ÷ 10) − 1) × 100%</code></div><p className="method-note">正数表示 ADR 溢价，负数表示折价。两条行情均来自 Hyperliquid 永续合约；价差包含合约基差，并非交易所现货价差。</p><div className="listing-note"><span>ADR 首次交易</span><b>2026.07.10</b></div></aside></div>
      <section className="source-panel"><button className="source-toggle" aria-expanded={details} onClick={()=>setDetails(!details)}><span><Info size={16}/>数据来源与覆盖范围</span><ChevronDown size={17} className={details ? "rotated" : ""}/></button>{details && <div className="source-content"><div><h3>行情来源</h3><p>Hyperliquid HIP-3 / XYZ：xyz:SKHX（正股美元代理）与 xyz:SKHY（ADR 代理）。SKHX 已包含韩元兑美元换算。使用已结束的 1 小时 K 线收盘价，仅匹配双方都有报价的时段；不补齐缺失报价。图中时间为该小时起点。</p><a href="https://docs.trade.xyz/perpetuals/specifications-and-schedules/specification-index" target="_blank" rel="noreferrer">XYZ 合约说明 <ArrowUpRight size={13}/></a></div><div><h3>历史覆盖</h3><p>ADR 于 2026 年 7 月 10 日以 SKHYV 首次交易。小时图从当日 14:00 UTC 开始，排除上市前的合约交易。{data ? `当前共同可用行情始于 ${stamp(data.firstAvailable)}。取数时间：${stamp(data.fetchedAt)}。` : "正在检查历史覆盖范围。"} 接口保留最近 5,000 根小时线，已保存的历史与新行情合并展示。休市时永续合约仍可交易。</p><a href="https://depositaryreceipts.citi.com/adr/guides/pgm_dispabook.aspx?cusip=78392B206&pageId=15&subpageID=111" target="_blank" rel="noreferrer">Citi ADR 换算比例 <ArrowUpRight size={13}/></a><a className="second-source" href="https://news.skhynix.com/en/skhynix-lists-adrs-on-nasdaq/" target="_blank" rel="noreferrer">上市公告 <ArrowUpRight size={13}/></a></div></div>}</section>
      <footer><span>HYNIX / SPREAD<span className="footer-divider">·</span>同口径，看价差。</span><span>Hyperliquid 永续合约数据<span className="footer-divider">/</span>所有时间为 UTC</span></footer>
    </main>
  </div>;
}
