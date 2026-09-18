# 长期运行部署说明

目标：**一次配置完成后，不需要人工干预就能持续对外提供服务**——进程挂了自动拉起、机器重启后自动恢复、数据落在持久卷并每日备份、证书自动续期、依赖与安全更新有固定流程。

`deploy/` 里的模板会在 `node scripts/prep-deploy.js` 执行时被复制进 `_deploy/`，所以只要项目源码在，部署包始终可以一键重建。

---

## 1. 准备一台常驻服务器

| 项 | 建议 |
|---|---|
| 规格 | 2 核 2G / 40G 盘（本项目占用很小，1 核 1G 也能跑，2 核更稳） |
| 系统 | Ubuntu 22.04 / 24.04 或 Debian 12 |
| 软件 | 只需 Docker（Node 22 由镜像内置，宿主机不需要装 Node） |
| 入口 | 固定公网 IP；要域名的话需解析到该 IP（国内服务器 80/443 需先完成 ICP 备案） |

安装 Docker（官方脚本）：

```bash
curl -fsSL https://get.docker.com | sh
```

## 2. 组装并上传部署包

在本机项目根目录：

```bash
npm run build:h5            # 生成 gushi-miniapp/dist-h5（改了前端就必须重新执行）
node scripts/prep-deploy.js # 组装 _deploy/：后端源码 + H5 产物 + 数据库快照 + Docker 模板
```

把 `_deploy/` 整个目录上传到服务器（`scp -r`、rsync、宝塔面板都行），假设放在 `/opt/gushi`。

## 3. 首次启动

```bash
cd /opt/gushi

# 容器内以 node(uid=1000) 运行，宿主目录属主必须是它，否则数据库无法写入
mkdir -p data uploads
chown -R 1000:1000 data uploads

# 按需编辑 .env：填 DOMAIN、AI_API_KEY，建议给 JWT_SECRET 一个固定值
# （留空时后台会自动生成并保存到 data/jwt.secret，同样不会因为重启掉线）
vi .env

docker compose up -d --build
docker compose ps          # app 应为 healthy
```

访问方式：

- 配了 `DOMAIN=gushi.example.com` → `https://gushi.example.com`（Caddy 自动签发证书，首次约 10 秒）
- 没配域名 → `http://服务器IP`

需要放行安全组/防火墙的 **80 和 443**（只用 IP + 3000 端口的话放行 3000，并把 compose 里 app 的 `ports` 打开）。

## 4. 让它真的"不用管"

### 4.1 开机自启与崩溃重启

`restart: unless-stopped` 已覆盖：容器崩溃、宿主机重启都会自动拉起。启用 Docker 自启即可确保开机后自动恢复：

```bash
systemctl enable docker
```

### 4.2 每日自动备份（唯一必须做的额外配置）

项目自带 `server/backup.js`，用 better-sqlite3 的 `backup()` 做快照，WAL 模式下也不会丢数据。

```bash
crontab -e
# 每天 3:10 备份数据库与上传图片，备份文件落在 /opt/gushi/data/backups/
10 3 * * * cd /opt/gushi && docker compose exec -T app node server/backup.js >> /var/log/gushi-backup.log 2>&1
# 每天 4:10 把备份同步到异地（对象存储/另一台机器，rclone 需自行配置）
10 4 * * * rclone sync /opt/gushi/data/backups remote:gushi-backups
```

异地这一条不能省：备份和数据库放在同一块盘、同一台机器上，遇到磁盘损坏或误删就一起没了。**每季度做一次恢复演练**（把备份复制回 `data/gushi.sqlite` 重启容器验证），没演练过的备份等于没有备份。

### 4.3 外部拨测告警（发现"整机挂掉"的唯一手段）

容器自启只能在机器活着时生效。用 Uptime Kuma / Better Stack 免费档 / 云厂商拨测，每分钟探测一次 `https://你的域名/api/health`，异常时发企业微信、钉钉或邮件。**没有告警的自动重启等于静默故障。**

### 4.4 日志

- Caddy 访问日志：`/data/access.log`（10MB 轮转、保留 5 份，在 caddy_data 卷里）
- 应用日志：`docker compose logs -f app`
- 限制容器日志体积，避免写满磁盘（`/etc/docker/daemon.json`）：

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
```

改完执行 `systemctl restart docker`。

## 5. 更新流程

代码更新后（含依赖升级），本机重新组装再上传：

```bash
npm run build:h5 && node scripts/prep-deploy.js
rsync -a --delete _deploy/ user@server:/opt/gushi/   # 注意排除 data/ uploads/ .env
ssh user@server 'cd /opt/gushi && docker compose up -d --build'
```

**要点：不要把 `data/`、`uploads/`、`.env` 覆盖掉**，它们是运行期数据与配置。建议用 `--exclude` 明确排除，或者只同步代码目录。

依赖安全更新建议用 Renovate / Dependabot 自动提 PR（每周），在 `.github/dependabot.yml` 里为 `server/`、`miniapp/` 和 `docker` 各自配置；合并后走上面的重建流程。注意 `better-sqlite3` 是原生模块，升级 Node 大版本时必须重新构建镜像（本项目用 Docker 构建，天然满足）。

## 6. 排障速查

| 现象 | 排查方向 |
|---|---|
| `docker compose ps` 里 app 不是 healthy | `docker compose logs app`；多半是 data 目录属主不对（重新 chown 1000:1000） |
| 页面能开但接口 502 | app 容器没起来，看日志里的 SQLite 报错或端口占用 |
| HTTPS 证书签发失败 | 80/443 未放行、域名未解析到本机、或国内服务器未备案 |
| 数据不见了 | 确认 `./data` 卷挂载生效；当前数据库应与部署快照不同（部署快照只在首次启动时使用） |
| 磁盘写满 | 检查 `data/backups` 保留策略与 Docker 日志大小限制 |

## 7. 这套方案的成本与边界

- 成本：一台 2 核 2G 轻量服务器约 40–100 元/月，域名约 30–60 元/年，无其他固定支出。
- 稳定性：单机方案能扛住进程崩溃、机器重启、证书过期、磁盘可恢复的故障；**扛不住整机/机房故障**，那需要双机 + 数据库迁移到托管数据库（SQLite 换成 PostgreSQL），属于另一个量级的投入。
- 适用规模：SQLite 是单写者模型，本项目这种"低频写入 + 中等读取"的业务足够用；如果日后出现高并发写入或多实例部署需求，再迁移数据库，接口层不用改。
