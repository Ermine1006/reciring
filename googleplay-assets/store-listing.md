# Mutu — Google Play 商店页填写内容(照抄即可)

素材文件都在 `googleplay-assets/` 里:
- 应用图标 → `icon-512.png`(512×512)
- 特色大图 Feature graphic → `feature-graphic.png`(1024×500)
- 手机截图 → `screenshots/` 里 5 张(1440×2868,已符合 Google 比例要求)
- 上传的安装包 → 项目根目录 `Mutu-release.aab`

---

## Store listing(商店页信息)

**App name / 应用名称**(≤30)
```
Mutu
```

**Short description / 简短说明**(≤80)
```
Post what you need, match with people in your community who can actually help.
```

**Full description / 完整说明**(≤4000)
```
Mutu is where your community helps each other — one small ask at a time.

Instead of cold-messaging strangers or posting into the void, you post exactly what you need and Mutu matches you with the people around you who can actually help.

POST A REQUEST IN 30 SECONDS
Pick a help type — referral, coffee chat, resume review, mock interview, intro, study group, or advice — add your industry and how much time it takes, and you're done. Structured requests get far more responses than a vague "can anyone help?"

SWIPE TO CONNECT
Browse requests from your community as clean, focused cards. Swipe right when you can help or want to connect, left to pass. When two people match, you're introduced.

MATCHES THAT GO SOMEWHERE
Every match lands in one place. Chat, schedule a coffee, and keep track of who you've connected with — no lost DMs, no spreadsheets.

COMMUNITY EVENTS
See real-life meetups hosted by members, RSVP in a tap, and show up to people you already have something in common with.

STAY ANONYMOUS UNTIL YOU'RE READY
You choose when to reveal your name. Browse and connect on your terms.

BUILT FOR A REAL COMMUNITY
Mutu is invite-only. Members join with their institutional email or an invitation, so the people you meet are actually part of your network — not the whole internet.

Whether you're looking for a referral, a quick piece of advice, or a coffee chat with someone a few steps ahead of you, Mutu turns "I wish I knew someone who…" into a warm intro.

Download Mutu and start helping — and getting helped.
```

**App category / 类别**: `Social`(社交)
**Tags**: networking, community, career

---

## Store settings(商店设置)

- **Email address**(必填,公开): `hello@muturing.com`
- **Website**: `https://www.muturing.com`
- **Privacy policy URL**(必填): `https://www.muturing.com/privacy.html`
  ⚠️ 上线前确认这个网址能打开;打不开就换成 iOS 用的那个隐私政策链接。

---

## App content(左侧菜单里几个必填问卷 — 我帮你预填了答案)

### App access(应用访问权限)
选 **All or some functionality is restricted**(部分功能需登录),然后加一个测试账号,给 Google 审核员用:
- Username: `mutu_appreview@mail.utoronto.ca`
- Password: `Mutu2026@`
- Instructions 里写:
```
Mutu is invite-only (University of Toronto / Rotman network). A new Google
account cannot get in without an invitation. Please sign in with the demo
account above: on the login screen choose "Sign in", enter the email and
password, tap "Sign in" to reach the home feed. Do not create a new account.
```

### Ads(广告)
选 **No, my app does not contain ads**(无广告)

### Content rating(内容分级问卷)
点 Start,如实按这样答(有会员间私信 + 用户发布内容):
- Category: **Social / Communication**
- 是否有用户生成内容 / 用户间通讯:**Yes**(有)
- 暴力 / 色情 / 脏话 / 毒品 / 赌博:**全部 No**
- 结果大概率是 **PEGI 3 / ESRB Everyone / 适合较低年龄**,但因含社交功能可能标注需家长留意 — 如实答就好。

### Target audience and content(目标受众)
- Target age:选 **18 and over**(Mutu 是给大学/研究生网络的,选 18+ 最省事,能避开儿童隐私 COPPA 的额外要求)
- Appeal to children:**No**

### Data safety(数据安全 — 最重要的一个问卷)
如实申报你收集的数据。Mutu 基于 Supabase,通常收集:
- **Personal info**: 姓名、邮箱(用于账号)→ 收集,加密传输,用于 App 功能
- **Messages**: 用户间聊天内容 → 收集
- **App activity**: 使用信息
- 是否与第三方共享:一般 **No**(除非你用了分析/广告 SDK)
- 数据是否加密传输:**Yes**
- 用户能否请求删除数据:如果 App 内或通过邮件支持能删,选 **Yes**
> ⚠️ 这个问卷要跟你隐私政策一致。不确定的题,把这一屏截图发我,我帮你逐题定。

---

## Release(发布)

Production → Create new release → 上传 `Mutu-release.aab` → Release name 填 `1 (1.0)` →
Release notes 填:
```
Welcome to Mutu on Android! Post a request in 30 seconds, swipe to connect
with people in your community who can help, and turn matches into coffee
chats and referrals. Community events are here too.
```
→ Save → Review release → Start rollout to Production。
