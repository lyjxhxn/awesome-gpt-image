# 远程测试与生产部署

## 环境分工

- Windows：运行 `npm run dev:full`、测试和构建，不安装 Docker。
- x86 测试机：运行 `deploy/core` 中的数据库、Auth、REST 和 Caddy；建议增加 2GB swap。
- ARM 生产机：运行独立的 `deploy/core` 数据卷，并通过 systemd 运行 Node 服务。

测试与生产必须使用不同的 `.env`、域名、JWT secret、anon key、service-role key和数据库卷。

## x86 测试机

1. 将仓库部署到服务器，复制 `deploy/core/.env.example` 为 `deploy/core/.env` 并替换全部占位值。
2. 将测试Auth子域名解析到服务器，只开放80和443端口。
3. 在1GB内存机器上先创建至少2GB swap，再运行 `docker compose --env-file .env up -d`。
4. 运行 `../apply-migrations.sh` 应用全部数据库结构。
5. Windows `.env.local` 使用测试域名、测试anon key和测试service-role key；绝不能填生产密钥。
6. 在Windows运行 `npm run dev:full`，访问 `http://127.0.0.1:5173`。

`GOTRUE_DISABLE_SIGNUP=true` 会关闭公开注册，但service-role管理接口仍可创建受邀用户。

## 首位管理员与邀请码

确认 `.env.local` 已连接测试环境、SMTP可用并完成migration后，先创建一个邀请码：

```powershell
npm run auth:bootstrap-code -- nasmy 20
```

第二个参数是最大使用次数，留空表示不限次数。然后使用 `SUPER_ADMIN_EMAILS` 中的邮箱完成普通注册，该账户首次登录时会获得超级管理员角色。

## ARM生产机

1. 创建全新的生产 `.env` 和Docker数据卷，不复制测试数据库。
2. 先用 `docker manifest inspect` 确认三个固定版本镜像支持 `linux/arm64`。
3. 将生产构建产物、`api`、`server`和生产依赖部署到 `/opt/awesome-gpt-image/current`。
4. 安装 `awesome-gpt-image.service`，并在 `/etc/awesome-gpt-image/app.env` 保存仅服务端使用的密钥。
   生产环境将 `HOST` 设置为 `0.0.0.0`，但防火墙不得开放8787端口；该端口只供Caddy容器通过Docker host gateway访问。
5. 将生产 `.env` 的 `CADDYFILE` 设为 `./Caddyfile.production`，并设置网站与Auth两个生产子域名。
6. 启动后检查 `/healthz` 与 `/readyz`，再执行邀请、登录、找回密码和业务回归测试。

## 备份

以cron或systemd timer每天运行 `deploy/backup-postgres.sh`。脚本保留28天本地备份；生产环境还必须把备份同步到另一台服务器或S3兼容存储，并至少完成一次恢复演练。
