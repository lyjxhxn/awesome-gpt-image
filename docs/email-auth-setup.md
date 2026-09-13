# 邮箱认证与 Resend 配置

网站的注册、登录与找回密码使用 Supabase Auth。浏览器只使用 Supabase URL 和 anon key；`service_role` key 只供 `/api` 服务端读取账户、收藏、会员和积分数据。所有业务表继续关联 `auth.users.id`，不需要为邮箱登录迁移用户 ID。

## 1. 创建并初始化 Supabase

1. 新建 Supabase 项目。
2. 按文件名顺序执行 `supabase/migrations` 目录中的现有 SQL 迁移。
3. 在 Authentication → Providers → Email 中启用 Email + Password，并开启 Confirm email。
4. 关闭 Google 以及其他当前不使用的社交登录 Provider。
5. 在 Authentication → URL Configuration 中设置：
   - Site URL：生产网站地址，例如 `https://gpt-image2.canghe.ai`。
   - Redirect URLs：加入生产网站地址、`http://127.0.0.1:5173/**`，以及实际使用的其他预览域名。

本地 `.env.local` 至少需要：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

`VITE_SUPABASE_ANON_KEY` 会进入浏览器包，安全边界由 RLS 策略提供。`SUPABASE_SERVICE_ROLE_KEY` 能绕过 RLS，禁止加 `VITE_` 前缀、提交到仓库或发送到浏览器。

## 2. 六位验证码邮件模板

在 Authentication → Email Templates 中修改模板。前端通过 `verifyOtp` 校验模板里的 `{{ .Token }}`，不要只发送确认链接。

Confirm signup 模板正文示例：

```html
<h2>验证你的邮箱</h2>
<p>请在 GPT-Image2 网站输入下面的六位验证码：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>如果不是你发起的注册，请忽略这封邮件。</p>
```

Reset password 模板正文示例：

```html
<h2>找回你的 GPT-Image2 账户</h2>
<p>请在网站输入下面的六位验证码，然后设置新密码：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>如果不是你发起的找回，请忽略这封邮件。</p>
```

在 Supabase Auth 设置中按产品安全要求配置 OTP 有效期和邮件发送频率。网站自身会限制 60 秒后才能重发，但服务端仍应保留 Supabase 的频率限制。上线前建议配置 CAPTCHA。

## 3. 配置 Resend Custom SMTP

1. 在 Resend 添加并验证生产域名的 DNS 记录。
2. 创建仅供 Supabase Auth 使用的 SMTP 凭据/API key。
3. 在 Supabase Authentication → SMTP Settings 中启用 Custom SMTP。
4. 按 Resend 控制台提供的值填写 SMTP host、port、username 和 password。
5. Sender email 使用已验证域名，例如 `auth@你的生产域名`；Sender name 可设为 `GPT-Image2`。

SMTP 密码保存在 Supabase 控制台，不需要写入本项目的 `.env`。开发期可先使用 Supabase 测试邮件，但它有发送限制，不应作为生产邮件服务。

## 4. 验收清单

- 新邮箱注册后收到六位验证码，输入后自动建立登录 session。
- 错误或过期验证码显示明确提示，60 秒后可重新发送。
- 邮箱密码登录后刷新页面仍保持 session。
- 找回密码无论邮箱是否存在都显示同一句发送提示，不泄露注册状态。
- 找回验证码通过后可以设置至少 8 位的新密码，并能使用新密码登录。
- 登录后 `/api/me`、收藏新增/删除、会员状态与积分余额正常。
- 退出登录后受保护操作重新要求登录。
- 浏览器构建产物和网络响应中不存在 `SUPABASE_SERVICE_ROLE_KEY`。

相关官方文档：[密码认证](https://supabase.com/docs/guides/auth/passwords)、[邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

## 5. 后续 QQ / 微信绑定

本期不展示 QQ 或微信登录按钮。取得对应开放平台的网站应用资质和回调域名后，应让用户先登录现有邮箱账户，再在账户设置中显式绑定第三方身份；不要按昵称、头像或第三方邮箱自动合并，以免收藏、会员或积分被拆到另一个用户 ID。
