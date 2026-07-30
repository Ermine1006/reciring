# Mutu — App Store Connect Metadata (Draft)

> Primary language: English (Canada). Character limits noted per field.
> Everything here is a draft — edit to taste before pasting into App Store Connect.

---

## English (Primary)

### App Name  (max 30 chars)
```
Mutu
```
_Alt if you want a descriptor: `Mutu: Ask & Connect` (19)_

### Subtitle  (max 30 chars)
```
Ask for help, match, connect
```
_(28 chars)_

### Promotional Text  (max 170 chars — editable anytime WITHOUT review)
```
Post what you need in 30 seconds, get matched with people who can actually help. Referrals, coffee chats, resume reviews, mock interviews — right inside your community.
```
_(167 chars)_

### Keywords  (max 100 chars, comma-separated, NO spaces after commas)
```
networking,mentor,referral,career,mba,alumni,coffee chat,peer,resume,mock interview,community,intro
```
_(99 chars — tune these; keywords are invisible to users but drive search)_

### Description  (max 4000 chars)
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

### What's New (version notes, max 4000 chars) — for v1.0
```
Welcome to Mutu 1.0! Post a request in 30 seconds, swipe to connect with people in your community who can help, and turn matches into coffee chats and referrals. Community events are here too. Thanks for being one of the first — we'd love your feedback.
```

### URLs
- **Support URL** (required): `https://www.muturing.com`
- **Marketing URL** (optional): `https://www.muturing.com`
- **Privacy Policy URL** (required): `https://www.muturing.com/privacy.html`

### Category
- **Primary:** Social Networking  _(best fit for a matching/community app)_
- **Secondary:** Business  _(career/networking angle)_

### Age Rating
- Expected **17+** is NOT needed. Likely **4+** or **12+** depending on the
  "Unrestricted Web Access" and user-generated-content questions. Since Mutu
  has member-to-member messaging + user content, answer the UGC questions
  honestly; that typically lands at **12+**. Do not overstate maturity.

---

## 简体中文 (zh-Hans) — 备用本地化

### 副标题 (≤30)
```
发布需求，智能匹配，连接
```

### 宣传文本 (≤170)
```
30 秒发布你的需求，匹配到真正能帮你的人。内推、咖啡聊、简历修改、模拟面试——都在你的社区里完成。
```

### 关键词 (≤100，逗号分隔无空格)
```
社交,人脉,内推,导师,职业,校友,咖啡聊,社区,简历,模拟面试,MBA,学生
```

### 描述 (≤4000)
```
Mutu 是让你的社区互相帮助的地方——从一个小小的请求开始。

不用再去冷启动私信陌生人，或把问题发到无人回应的地方。在 Mutu，你精确地写下你需要什么，它会把你匹配给身边真正能帮上忙的人。

30 秒发布一个请求
选择帮助类型——内推、咖啡聊、简历修改、模拟面试、引荐、学习小组或建议——加上行业和所需时间，就完成了。结构化的请求，回应率远高于一句含糊的“有人能帮忙吗”。

滑动即连接
把社区里的请求浏览为清爽的卡片。能帮忙或想连接就右滑，跳过就左滑。双方匹配后，你们就被互相引荐。

有结果的匹配
每一次匹配都汇聚在一处。聊天、约咖啡、追踪你连接过的人——不再有丢失的私信。

社区活动
查看成员发起的线下聚会，一键报名，遇见本就有共同点的人。

在你准备好之前保持匿名
由你决定何时公开姓名，按自己的节奏浏览和连接。

为真实社区打造
Mutu 是邀请制的。成员用机构邮箱或邀请加入，你遇到的都是你人脉网络里的人，而不是整个互联网。

无论你在找一个内推、一条建议，还是和走在前面几步的人来一场咖啡聊，Mutu 都能把“要是我认识某个……就好了”变成一次温暖的引荐。

下载 Mutu，开始帮助别人，也被别人帮助。
```

---

## App Review Information (提交表单里，非常重要 — 邀请制必填)

> ⚠️ SENSITIVE: this section contains a demo password. Do NOT commit this file to git.
> NOTE: Use an INSTITUTIONAL (utoronto) email/password account — Mutu's email
> sign-in is restricted to UofT domains, and non-UofT accounts can only enter
> via Google OAuth (which Apple reviewers can't complete). Create the account
> with create-demo-reviewer.mjs, then verify email/password login reaches the feed.

**Sign-In required:** YES

**Demo Account**  (email/password — no Google needed)
- Username: `mutu_appreview@mail.utoronto.ca`
- Password: `Mutu2026@`

**Notes to Reviewer:**
```
Mutu is an INVITE-ONLY community app for the University of Toronto / Rotman
network. A newly registered Google/Gmail account cannot get in without an
invitation, so please sign in with the pre-approved demo account above — do
NOT create a new account.

Steps: On the login screen choose "Sign in", enter the email and password
above, and tap "Sign in". You'll land on the home feed with events, requests
to browse, and matching.

Google Sign-In also works but is gated by invitation, so please use the email
sign-in above. There are no in-app purchases.
```
