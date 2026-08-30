# Mutu Exchange 流程蓝图(UX 评审用)

日期:2026-08-27 · 范围:Rotman Consulting Pilot · 功能开关 `mutu_practice`(默认关闭)
说明:界面字符串为线上真实英文文案(以 `等宽` 标注),流程说明为中文。

Exchange 是 Mutu 的统一"互惠交换"入口:两个人各出一轮价值(如模拟面试互当考官),双方确认完成后共同获得一枚不可交易的 Exchange Token。本文档覆盖全部用户旅程与每个界面状态,供 UX 专家评估流程是否顺畅、文案与界面是否匹配。

---

## 〇 · 五条产品铁律(评审底线)

以下规则由数据库层强制,UI 只能顺应。评审若发现流程不顺,解法必须绕开这些约束而不是打破它们。

1. **匹配只看类型互补**:"Strong fit" 仅由练习类型双向互补决定。时间是否重叠永远不会取消匹配资格,只改变按钮形态。
2. **双方接受前完全匿名**:浏览、邀请、被邀请全程无名字/头像/身份线索;接受的那一刻自动互相揭示,之后不再有"申请揭示"环节。
3. **Token 只在双方确认后铸造**:浏览、邀请、接受、排期、单方确认都不产生奖励。一场验证成功 = 恰好一枚双人共享 Token。
4. **声誉全部可解释**:只展示可验证的行为数字(已验证次数/帮助人数/履约率/回头搭档);样本不足(<5 场)时隐藏百分比;无排行榜、无连击、无稀缺倒计时。
5. **一切按社区隔离**:请求、配对、Token、声誉均限定在 Rotman 社区内,未来其他社区互不串数据。

---

## 一 · 信息架构

开关开启后底部导航四项:`Home · Discover · Exchange · Matches`。原 Post 移入 Discover 的 "+" 按钮;原 Events 区保留全部功能,入口移到 Exchange 信息流(活动卡与 `Browse all events →`)。

```
底部导航 → Exchange
Exchange ├─ Explore
         │   ├─ "What do you want to do?" 四宫格意图磁贴
         │   └─ "Ready for you" 机会卡片流 ──→ 三步建档 / 活动详情(原 Events 页)
         ├─ My Exchanges ──→ 配对详情 ──→ Exchange 聊天(Matches 内)/ Token 解锁弹窗
         └─ 金色 Token 药丸 ──→ My Impact 面板
```

**返回规则**:从 Exchange 打开的活动详情,Back 回 Exchange;从 Home/Events 区打开的,Back 回原处,互不串扰。

---

## 二 · 核心旅程

### J1 · 首次发布(约 30 秒)
1. **点 Mock interview 磁贴**(S2)——无请求的用户点击磁贴直接进入三步建档;已有请求的用户点击只是筛选下方内容。
2. **三步作答**(S3)——想练什么 → 能帮什么 → 什么时候有空。每步只答一个问题;补充说明折叠在 `+ Add more details (optional)`;一个时间窗即可发布。
3. **发布上架**(S2)——横幅 `Your request is live! You stay anonymous until you and a partner accept each other.` 回到 Explore;无匹配时显示 "You're all set!" 在线卡(含本人帖子摘要与时间)。

### J2 · 发出邀请(两条路)
1. **看到互补伙伴卡**(S4)——Ready for you 只显示双向互补的机会。卡片自答六问:做什么 / 我得到什么 / 我付出什么 / 何时何地 / 下一步 / 完成得什么。
2. **路 A:`I can make this time`** ——锁定对方展示的具体时段(多时段可切换)。按钮只在时段尚未开始时出现;这是发起者的一次性时间承诺,不要求先修改自己的空闲时间。
3. **路 B:`Suggest another time`** ——对方时段全部过期或不合适时的普通邀请,接受后再共同定时间。时段全过期时它自动升为主按钮并说明原因。
4. **发送反馈**——横幅确认 + 自动滚回顶部;对方收到匿名通知(正文不含任何身份)。

### J3 · 接受 = 揭示身份(+自动订场)
1. **被邀请方审阅**(S8)——My Exchanges → Needs action:匿名邀请卡展示对方快照;时段邀请额外显示 `They can make your slot: …`。
2. **点接受**——普通邀请按钮 `Accept & reveal identities`;时段邀请 `Accept & book this time`(接受即订下场次,状态直接 Scheduled)。同一时段全局只能被订一次。
3. **双方即时反馈**(S11)——发起方顶部滑出金色 Toast(`Tap to view →` 直达配对详情)+ 铃铛。双方身份互见,Exchange 专属聊天生成(带 `EXCHANGE` 徽章;同一对人复用同一条聊天)。

### J4 · 共同定时间(提议 → 确认)
1. **任一方提议**(S6)——配对详情自动列出双方空闲交集(点选即填);无交集也可手填任意未来时间。
2. **对方响应**——非提议方看到 `Confirm this time` / `Suggest another time`;提议方只能撤回,不能确认自己。
3. **确认成排期**——进度条走到 Scheduled;出现 `Add to Google Calendar` 一键入日历(标题/起止/地点/两轮说明齐全)。

### J5 · 完成与奖励
1. **到点开练**(S6)——两轮议程卡(5 定序 → 20+5 第一轮 → 20+5 第二轮 → 5 约后续),标注"是指引不是计时器"。
2. **各自确认**——开始时间过后出现确认卡;选 "It happened" 必须勾选两项(我练了我的一轮 / 我主持了对方的一轮)。先确认者看到"等待对方";结果冲突则冻结为 Under review。
3. **Token 解锁时刻**(S7)——后确认的一方触发弹窗:金色双环 Token + `+1 Exchange Token` + 累计数 + 关系增强,附一条"下一个强匹配"的安静入口。声誉数字与徽章同步前进。

### J6 · 结束与重逢
1. **单方结束**(S6)——详情页底部 `End this partnership` → 确认框写明后果(历史与聊天保留 / 已排场次取消 / 对方会收到通知 / 随时可重逢)。等待双方确认的场次不受影响,诚实完成仍可领 Token。
2. **对方获知**——Toast + 铃铛 `Partnership ended`;双方立即重新出现在彼此的 Ready for you(无冷却)。
3. **重逢**——再次邀请-接受后复用原来的聊天,消息不重复、不分裂。

### J7 · 活动路径(诚实无奖励)
1. **Attend an event 磁贴**(S2)——Ready for you 切换为 `COMMUNITY EVENT` 卡:标题/时间/地点/人数 + `View event →`。不承诺 Token(现有后端无法验证到场与互惠贡献)。
2. **进入原活动详情**——报名/聊天等沿用现有 Events 功能;Back 回 Exchange。已报名或主办的活动出现在 My Exchanges → Upcoming,标注 `Attend · no token`。

---

## 三 · 界面清单(每屏状态对照)

### S1 · 底部导航(全局)
| 状态 | 表现 |
|---|---|
| 开关关 | Home · Discover · Post · Matches · Events(现状完全不变) |
| 开关开 | Home · Discover · **Exchange**(双环箭头图标)· Matches;Discover 右下角绿色 "+" 承接发帖 |

### S2 · Exchange · Explore(默认页)
页头 `Exchange` + 金色双环药丸(真实 Token 数,点开 S9;查询失败时整体隐藏,加载中全页骨架)。分段切换 `Explore | My Exchanges`(右侧带待办角标)。

| 区块 | 状态与规则 |
|---|---|
| 意图磁贴 | 2×2:**Mock interview**(默认选中,抹茶态)与 **Attend an event** 可用;Review resumes / Join a circle 置灰 + Coming soon,点击仅提示不假装可用 |
| Ready for you | 随磁贴切换内容;标题右侧小链接 `Edit setup`(仅已建档时) |
| 横幅 | 所有成功/报错提示出现于页顶,并自动滚回顶部保证被看见 |

### S3 · 三步建档 Setup Flow(入口:磁贴(未建档)/ Edit setup / My post 卡)
| 步骤 | 要点 |
|---|---|
| Step 1 of 3 | `What do you want to practise?` 大号类型芯片(Case / Behavioural),细节折叠 |
| Step 2 of 3 | `What can you help with?` 同构;副题解释"你为对方主持这一轮" |
| Step 3 of 3 | `When are you free?` 一窗即可;窗口为两行卡片(日期行 + 起止行,小屏不溢出);格式默认 Virtual 收进折叠 |
| 编辑深链 | 已建档者可被直接送入任一步(如从提醒卡直达);首次用户永远从第 1 步开始 |
| 底部恒句 | `🔒 You stay anonymous until you and a partner both accept.`(唯一一句匿名说明) |

### S4 · 伙伴机会卡 Partner Card(Explore · Mock interview 磁贴)
结构:`1:1 EXCHANGE` 芯片 + 右上 `Anonymous peer` → 互惠标题 `Case ↔ Behavioural` + 深绿 `✓ Strong fit` → `YOU GET / YOU GIVE` 双栏 → `They're free: …(含时区)` → 🔒 匿名句 → 金色 `Complete together · Earn 1 token` → 双按钮。

| 变体 | 触发与表现 |
|---|---|
| 可订时段 | 主按钮 `I can make this time`(多时段以芯片切换)+ 次按钮 Suggest another time |
| 时段全过期 | 无时间行;说明句 + `Suggest another time` 升为唯一主按钮 |
| 未建档浏览 | 不出卡片,显示聚焦空态:`Find a mock interview partner / Set up my exchange` |
| 建档但无匹配 | "You're all set!" 在线卡:呼吸绿点 + 本人帖子摘要与时间 + `No strong matches yet` + 唯一按钮 `Improve my exchange →` |
| 本人时段全过期 | 金色提醒卡 `Your listed times have passed / Add new times`(直达 Step 3) |

### S5 · 邀请卡 Invitations(My Exchanges · Needs action / Awaiting confirmation)
| 方向 | 内容与按钮 |
|---|---|
| 收到(匿名) | 豆豆头像 + 对方快照(练什么/能帮什么)+ 剩余天数;时段邀请附金框 `They can make your slot: … / Accepting books this time as your session.`;按钮 Decline / `Accept & book this time`(或 Accept & reveal identities) |
| 发出(匿名) | 同构快照 + `Withdraw invitation`;时段邀请显示 "You said you can make: …" |

### S6 · 配对详情 Pairing Detail(入口:My Exchanges 行 / Toast / 通知 / 聊天内 Open exchange →)
顶部:返回 + 对方真名头像 + `Exchange partner · identities revealed` + `Open chat`。其下永远先是三步进度条 `Matched → Scheduled → Completed together`,再是"你们的交换"快照卡(含 Token 预告)。

| 调度状态 | 界面 |
|---|---|
| Scheduling | 双方空闲交集点选 + 手动日期/时长/形式表单 → `Propose this time to {name}` |
| Proposal sent | 展示提议 + 仅 `Withdraw & propose a different time` |
| Proposal received | `Confirm this time` / Suggest another time |
| Scheduled | 金框时间卡 + `Add to Google Calendar` + 取消链接;下方两轮议程卡 |
| Ready to confirm | 确认卡:三选一结果;"It happened" 需勾双轮;不可撤销提示 |
| Waiting / Verified / Disputed | 等待卡(绿)/ 验证成功卡(金,指向 Completed)/ 冻结说明(红) |
| 结束入口 | 底部下划线 `End this partnership` → 确认框(红色确认 + Keep the partnership) |

### S7 · Token 解锁弹窗(仅在双方互验成功瞬间)
克制的白金抹茶:双环金牌浮入 → `+1 Exchange Token` → 累计数与关系增强一句话 → 可选"下一个强匹配"入口 → Done。无任何赌场式元素;单方确认永不触发。

### S8 · My Exchanges(Exchange 第二视图)
| 分区(按需出现) | 内容 |
|---|---|
| My post | 本人帖子全文:在线状态(时段过期时转金色警示)· 练/帮 · 逐条时间(过期划线注 passed)· 时长/形式 · Edit / Withdraw |
| Needs action | 收到的邀请 + 需我行动的场次(选时间/回应提议/确认完成) |
| Upcoming | 已排定场次 + 我报名/主办的活动(标 `Attend · no token`) |
| Awaiting confirmation | 发出的邀请 + 等对方的场次 |
| Completed | 共享 Token 历史(对方真名、类型、日期、回头 ×N) |
| 全空 | `Nothing here yet / Explore exchanges →` |

### S9 · My Impact 面板(入口:金色 Token 药丸)
底部抽屉:声誉标签(New to Exchange → Contributor → Reliable contributor)+ 四项可验证指标(履约率需 ≥5 场样本才显示)+ 四枚徽章(First Exchange / Reliable Partner / Community Contributor / Trusted Collaborator,标准全文可见,未获得显示 n/target 进度)+ 社区隔离脚注。

### S10 · Exchange 聊天(Matches 列表,EXCHANGE 徽章)
顶部姓名旁 `EXCHANGE` 徽章;背景卡 `Exchange partners / A reciprocal exchange` + 绿色 `Open exchange →` 直达配对详情。已移除:咖啡约按钮、约时间智能提示、"We met" 确认卡——Exchange 聊天只聊,一切流程动作在 Exchange 页,单一事实来源。同一对人永远只有一条 Exchange 聊天。

### S11 · 通知系统(铃铛 + 实时 Toast)
| 层 | 行为 |
|---|---|
| 实时 Toast | 八类 Exchange 通知到达即顶部滑出金色卡(标题+正文+`Tap to view →`),8 秒自动消失,点击=已读+直达对应配对/场次 |
| 铃铛列表 | 全量留存;点击任意 Exchange 通知同样直达;邀请类通知正文不含身份 |

---

## 四 · 状态一览

**配对(Pairing)**:
`Invited`(发出邀请,可带时段)→ `Accepted`(对方接受:揭示身份+建聊天;时段邀请同时订场)/ `Declined`(30 天互相隐身)/ `Withdrawn`(撤回)/ `Expired`(14 天未回应)。`Accepted → Ended`(任一方结束;通知对方;立即可重逢)。

**场次(Session)**:
`Proposed`(一方提议)→ `Scheduled`(对方确认;或时段邀请接受即达)/ 拒绝、撤回、过期后回到未排。`Scheduled → Cancelled`(取消,无惩罚)或 → `Pending`(一方确认完成)→ `Verified`(双方一致,铸 1 Token)/ `Disputed`(结果冲突,人工处理)。

---

## 五 · 给 UX 专家的审查清单

1. **五秒测试**:首屏(S2)能否让新用户明白"这里能和人互换练习并赚取凭证"?磁贴问句 + 卡片六要素是当前的答案,是否足够?
2. **"You're all set!" 无匹配态**是否足以留住已发布用户?目前是在线感 + 单按钮改进入口;是否需要供给信号(如"本周 N 人在找 behavioural 搭档")?
3. **时段邀请(接受即订场)与普通邀请(先配对再约)并存**,被邀请方是否能明确分辨后果?当前靠金框 "Accepting books this time" 一句话承载。
4. **"对方时段全过期"降级态**的说明是否会被误读为故障?这是铁律 1 刻意的表现形式。
5. **匿名卡的 YOU GET/YOU GIVE 是观看者视角**,镜像双方看到的方向一致——是否仍可能被误认为"自己的帖子"?已加 "Anonymous peer" 与 "They're free:";是否需要更强的他者线索?
6. **确认完成卡的"双轮勾选"**是否会造成流失?这是互惠验证的核心约束(铁律 3),只能优化表达不能移除。
7. **End partnership 的措辞与红色确认**是否与"温和、可重逢"的定位一致?
8. **Toast(8 秒)+ 铃铛的双层通知**是否覆盖了所有需要即时性的时刻?还缺推送/邮件的场景排序?

---

## 六 · 已知边界(评审时请视为约束而非疏漏)

| 项目 | 现状 |
|---|---|
| Review resumes / Join a circle | 后端无数据模型,磁贴诚实置灰 Coming soon |
| 活动 Token | 无到场验证机制,活动卡不承诺奖励 |
| 对方声誉上卡 | 匿名侧拿不到他人聚合数据,暂不显示(避免造假),待后端聚合接口 |
| 自动提醒 | 开练前 / 待确认催办的邮件与推送未接(已有定时任务底座,属下阶段) |
| 刷新机制 | 列表数据无实时推送,靠进入页面加载;通知与聊天为实时 |

---

*Mutu · Exchange UX Review Packet · 与代码同步于 2026-08-27 · 所有等宽标注均为线上真实界面文案*
