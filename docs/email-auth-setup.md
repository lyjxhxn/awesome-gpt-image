# 邀请制邮箱认证与 SMTP 配置

网站的登录与找回密码使用 Supabase Auth。注册由Node API控制：用户先接收并验证邮箱验证码，再填写用户名、邀请码和密码。管理员可限制邀请码使用次数，也可关闭邀请码要求。

## 1. 创建并初始化 Supabase

1. 按 `deploy/README.zh-CN.md` 创建自托管测试或生产实例。
2. 按文件名顺序执行 `supabase/migrations` 目录中的现有 SQL 迁移。
3. 启用 Email + Password，并设置 `GOTRUE_DISABLE_SIGNUP=true`，禁止公开注册。
4. 关闭所有当前不使用的社交登录Provider。
5. 配置：
   - Site URL：生产网站地址，例如 `https://gpt-image2.canghe.ai`。
   - Redirect URLs：加入生产网站地址、`http://127.0.0.1:5173/**`，以及实际使用的其他预览域名。

本地 `.env.local` 至少需要：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_URL=https://YOUR_TEST_AUTH_DOMAIN
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
AUTH_REGISTRATION_HASH_SECRET=AT_LEAST_32_RANDOM_CHARACTERS
```

`VITE_SUPABASE_ANON_KEY` 会进入浏览器包，安全边界由 RLS 策略提供。`SUPABASE_SERVICE_ROLE_KEY` 能绕过 RLS，禁止加 `VITE_` 前缀、提交到仓库或发送到浏览器。

## 2. 注册验证码与找回密码邮件

注册验证码由Node API直接通过SMTP发送，10分钟内有效且最多尝试5次。邮箱验证成功后产生15分钟有效的注册会话，只有完成邀请码和密码校验后才创建 `auth.users`。

Reset password 模板正文示例：

```html
<h2>找回你的 GPT-Image2 账户</h2>
<p>请在网站输入下面的六位验证码，然后设置新密码：</p>
<p style="font-size:32px;font-weight:700;letter-spacing:8px">{{ .Token }}</p>
<p>如果不是你发起的找回，请忽略这封邮件。</p>
```

找回密码继续通过 `verifyOtp` 校验六位验证码。服务端保留Supabase频率限制，邀请接受接口另外实施IP和邮箱限流。

## 3. 配置标准 SMTP

1. 在邮件服务商添加并验证发信域名的DNS记录。
2. 创建独立SMTP凭据。
3. 将同一组SMTP参数填入GoTrue和Node服务环境文件。
4. 配置 SMTP host、port、username、password和TLS模式。
5. Sender email 使用已验证域名，例如 `auth@你的生产域名`；Sender name 可设为 `GPT-Image2`。

SMTP密码只保存在服务器环境文件和Windows忽略的 `.env.local` 中，禁止提交Git。

## 4. 验收清单

- 普通Supabase注册接口无法创建用户。
- 用户验证邮箱后可填写用户名、邀请码和密码完成注册。
- 缺少邀请码、邀请码错误、已撤销或达到使用次数上限时无法注册。
- 管理员关闭邀请码要求后，注册仍必须完成邮箱验证码验证。
- 邮箱密码登录后刷新页面仍保持 session。
- 找回密码无论邮箱是否存在都显示同一句发送提示，不泄露注册状态。
- 找回验证码通过后可以设置12–128位的新密码，并能使用新密码登录。
- 登录后 `/api/me`、收藏新增/删除、会员状态与积分余额正常。
- 退出登录后受保护操作重新要求登录。
- 浏览器构建产物和网络响应中不存在 `SUPABASE_SERVICE_ROLE_KEY`。

相关官方文档：[密码认证](https://supabase.com/docs/guides/auth/passwords)、[邮箱 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)、[邮件模板](https://supabase.com/docs/guides/auth/auth-email-templates)、[Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。

## 5. 后续 QQ / 微信绑定

本期不展示 QQ 或微信登录按钮。取得对应开放平台的网站应用资质和回调域名后，应让用户先登录现有邮箱账户，再在账户设置中显式绑定第三方身份；不要按昵称、头像或第三方邮箱自动合并，以免收藏、会员或积分被拆到另一个用户 ID。
