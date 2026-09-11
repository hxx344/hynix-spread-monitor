# Linux 一键部署

此版本用一个常驻 Node.js 进程同时提供 Next.js 网页、配置 API 和每 10 秒运行的告警监控。无需 Cloudflare、Docker、数据库或飞书应用 App ID。关闭网页后仍可告警。生产运行使用单实例，不要用 PM2 cluster 或让多个服务共用数据目录。

## 1. 执行一条命令

支持 Ubuntu 22.04 / 24.04、Debian 12 / 13，x86_64 或 ARM64，需使用 systemd。建议至少 2 GB 内存、5 GB 可用磁盘；安装时需访问 GitHub、nodejs.org、npm 和系统软件源。

在服务器终端执行：

```bash
curl -fsSL https://raw.githubusercontent.com/hxx344/hynix-spread-monitor/main/deploy/install.sh | bash
```

root 直接运行；普通用户会通过 sudo 提权，可能需要输入系统密码。不需要事先安装 Node.js、Git、Docker 或数据库。极简系统若没有 curl，先执行 `apt-get update && apt-get install -y curl`（普通用户在两个命令前加 sudo）。

脚本会自动安装项目专用 Node.js 24.15.0（校验官方 SHA-256，不替换系统 Node.js）、下载公开仓库的 main 最新提交、安装依赖并构建、创建服务用户、生成登录密码、启动服务并设置开机启动。完成后会显示访问地址、用户名和密码。

打开 `http://服务器IP:3000`，使用显示的账号密码登录。远程访问需在云安全组及服务器防火墙放行 TCP 3000。首次安装也可指定端口，例如 8080：

```bash
curl -fsSL https://raw.githubusercontent.com/hxx344/hynix-spread-monitor/main/deploy/install.sh | bash -s -- --port 8080
```

已有 `/etc/hynix-spread.env` 时完整保留原配置，包括密码和监听地址，`--port` 不会覆盖已有端口。旧版手工安装也可直接运行同一命令升级；原先仅监听 `127.0.0.1` 的服务继续通过原反向代理访问。

## 2. 管理服务

```bash
sudo systemctl status hynix-spread
sudo systemctl restart hynix-spread
sudo journalctl -u hynix-spread -n 100 --no-pager
sudo journalctl -u hynix-spread -f
```

网页和接口使用同一组登录信息。密码保存在仅 root 可读的 `/etc/hynix-spread.env`，可执行 `sudo cat /etc/hynix-spread.env` 查看；用 `sudoedit /etc/hynix-spread.env` 修改后重启服务。密码至少 12 个字符，建议保持为字母数字。此文件使用普通 `KEY=value` 格式，不写 shell 命令。

`/healthz` 只表示服务存活；行情获取和飞书状态在网页“飞书阈值告警”内查看。公网使用时，可按 `deploy/nginx.conf.example` 配置已有域名的 HTTPS 反向代理，以加密登录信息。

从本地源码安装：在项目目录执行 `sudo bash deploy/install.sh --source-dir "$PWD"`。不安装 systemd 的临时开发运行方式：使用 Node.js 22.13+，执行 `npm ci` 和 `npm run build:linux`，复制 `.env.linux.example` 为 `.env.linux`，填写密码，把 `ALERT_DATA_DIR` 改为 `./runtime-data`，再执行 `npm run start:linux`。

## 3. 配置飞书和多档阈值

在飞书目标群里添加“自定义机器人”，复制 Webhook；如果启用了签名校验，同时复制签名密钥。网页展开“飞书阈值告警”：

1. 填写 Webhook 和可选签名密钥。保存后只显示“已配置”，不回传密钥；留空保存会保留旧值。
2. 添加一档或多档阈值，每档填写名称、`高于或等于` / `低于或等于` 和溢价率百分数，例如填 `40` 表示 `40%`。
3. 设置冷却时间和回差，勾选“启用飞书告警”并保存。
4. 点击“发送测试消息”检查连通性；测试发送到已保存的机器人。

告警默认关闭，不预设交易阈值。首次启用时如果当前已满足条件，下一次后台检查就会发送。一次跨越多个档位时合并为一条飞书消息；不同方向可以同时配置。

每条规则发送成功后，只有价格跨回重置线才重新布防。例：上方阈值 40%，回差 0.5 个百分点，需跌破 39.5% 后才重新布防；再次达到 40% 且距上次成功发送达到冷却时间时再发。下方阈值规则方向相反。回差为 0 时也需要严格回到阈值另一侧，等于阈值不会反复重置。

普通保存、调整名称或顺序不会重置触发状态。改变某档的方向、阈值、启用状态或重新打开总开关，会将对应条件重新布防，可能在下次检查立即触发。

飞书失败时至少间隔 30 秒重试，并重新检查最新报价；价格已退出触发区域就不会补发旧信号。行情接口失败或报价接收时间超过 30 秒不触发新告警。报价时间是成功接收 `allMids` 的时间，接口不提供交易所成交时间。

机器人如开启关键词校验，可配置关键词 `海力士价差告警`。签名校验依赖服务器时间准确；启用 IP 白名单时需放行 Linux 服务器出口 IP。HTTP 200 仍需飞书返回 `code: 0` 才算成功。

## 4. 数据、备份与升级

阈值、Webhook、签名密钥、每档触发状态和最近 100 条发送记录保存在 `ALERT_DATA_DIR/alerts.json`，默认 `/var/lib/hynix-spread/alerts.json`。目录权限 700、文件权限 600；不要提交或公开此文件。数据通过串行原子替换写入。损坏文件不会被自动覆盖，服务会拒绝启动并提示恢复。

正常重启会保留已触发状态。飞书确认送达后、磁盘记录成功前如异常断电，后续可能重复发送；机器人接口没有提供严格幂等保证。

```bash
# 备份（备份包含机器人密钥，保持同等权限）
sudo systemctl stop hynix-spread
sudo cp -p /var/lib/hynix-spread/alerts.json /var/lib/hynix-spread/alerts.backup.json
sudo systemctl start hynix-spread

# 升级：与首次安装完全相同
curl -fsSL https://raw.githubusercontent.com/hxx344/hynix-spread-monitor/main/deploy/install.sh | bash
```

仓库公开，安装和升级无需 GitHub 登录。配置放在 `/etc/hynix-spread.env`，数据放在 `/var/lib/hynix-spread`，项目版本放在 `/opt/hynix-spread/releases`，`/opt/hynix-spread/current` 指向正在运行的版本。

升级在独立目录中完成下载和构建，此时原服务继续工作；只在切换时短暂停机。启动后检查登录、告警 API 和运行进程，新版本失败时恢复原版本及服务文件。保留旧版本目录用于排查，可在确认升级稳定后按需清理旧目录，保留 `current` 指向的目录；不要删除 `/var/lib/hynix-spread`。行情档案的覆盖范围及更新方式见根目录 README。

## 两种运行入口

| 用途 | 构建 | 启动 | 后台告警 |
|---|---|---|---|
| Linux 常驻服务 | `npm run build:linux` | systemd 或 `npm run start:linux` | 支持，独立于网页 |
| Sites 托管 | `npm run build` | Sites 发布流程 | 页面提示未运行 Linux 后台 |

Linux 使用常驻自定义 Next.js 服务入口 `server/linux.mjs`，不能改用 `next start`，否则不会启动告警监控和配置 API。

参考：[飞书自定义机器人文档](https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot)、[Next.js 自定义服务器](https://nextjs.org/docs/app/guides/custom-server)。
