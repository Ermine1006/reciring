# Practice 试点 — 双账号人工端到端测试清单(中文版)

**账号:** 两个真实、已激活、且属于 Rotman 社区的 Mutu 账号(43 位已录入成员中任意两个,比如你自己的两个邮箱)。下文称 **A** 和 **B**。不需要造测试数据;流程本身会产生真实记录,请用你不介意留下练习历史的账号(之后想清理可在 SQL Editor 手动删)。

**设备:** 两台设备或"普通窗口 + 无痕窗口",各登录一个账号。在**每台设备**的浏览器控制台执行 `localStorage.setItem('mutu_practice','on')` 然后刷新,即可打开功能开关。(执行 `localStorage.removeItem('mutu_practice')` 可关回。)

请按顺序执行——后面的步骤依赖前面的结果。

## 1 · 开关与导航
- [ ] 开关关闭(默认)时:底部栏保持原样(Home · Discover · **Post** · Matches · Events),全 App 看不到任何 Practice 痕迹。
- [ ] 开关打开后:底部栏变为 Home · Discover · **Practice** · Matches · Events;在你最窄的设备上(最好是 iPhone SE 宽度)标签不换行不挤压。
- [ ] Discover 右下角出现圆形绿色 **+** 按钮;点它打开原来的发帖页(Create request / My posts),功能不变。

## 2 · 创建练习请求(两个账号都做)
- [ ] A:Practice → My request + → 选"我想练"(如 **Case**)、"我能帮"(如 **Behavioural**)、填目标说明、加至少一个未来的空闲时间窗,保存。出现确认横幅;"My request" 显示已发布的摘要。
- [ ] 不选任何"我能帮"就保存 → 被拦下并给出清晰提示(双向规则)。
- [ ] 确认"编辑"是原地更新(没有创建第二条请求的入口)。
- [ ] B:创建**镜像**请求(想练 Behavioural、能帮 Case),时间窗与 A 有重叠。

## 3 · 匿名浏览(阶段 A)
- [ ] B:Partners 页能看到 A 的卡片:豆豆头像、"Anonymous Rotman member"、**双向互惠解释两句话**、精确到时段的空闲时间(带时区标注,如 "… EDT")、形式和时长。**任何地方都看不到名字和照片。**
- [ ] A 看不到自己的卡片。
- [ ] A:暂停或撤回请求 → B 刷新 Partners → A 的卡片消失;重新发布 → 卡片回来。

## 4 · 发出邀请(依然匿名)
- [ ] B:点 A 卡片上的 **Invite to practise** → 出现确认横幅;该卡片从 B 的 Partners 消失;Invites 页"Sent by you"下出现这条邀请并显示剩余天数。
- [ ] A:铃铛收到"New practice invitation"通知(**通知里没有名字**);Invites 页"For you"显示邀请:B 的想练/能帮摘要、豆豆头像、**无身份信息**。
- [ ] B:若从未刷新的旧页面再点一次邀请 → 得到干净的"已有邀请"提示,不产生重复。
- [ ] (可选)拒绝路径:A 拒绝 → 双方邀请消失;B 的 Partners 不再显示 A(30 天冷却)。为继续主流程,请**改用下面的接受路径**(拒绝测试可以之后用第三个账号做)。

## 5 · 接受 = 互相匹配 + 身份揭示
- [ ] A:点 **Accept & reveal identities** → 进入配对详情:能看到 B 的**真实姓名和头像**,标注"identities revealed"。
- [ ] B:刷新 → 同一配对里看到 A 的真名。
- [ ] Matches 页(双方):出现一条**新的**对话,带 **Practice** 徽章;打开后有"Practice partners"背景卡片,顶部显示真名——且**没有**"申请揭示身份"的流程。
- [ ] 如果 A、B 之前就有一条旧的(匿名)聊天:它**原样保留、依然匿名、一字未动**——两条对话并存。

## 6 · 双向定时(提议 → 确认)
- [ ] A(或 B):配对详情 → "You're both free" 显示双方时间窗的交集 → 点交集自动填表,选时长、线上 + 链接,提交提议 → 对方收到"Practice time proposed"通知。
- [ ] 提议方看到"Time proposed — waiting",只能**撤回**;另一方看到 **Confirm / Suggest another time**。
- [ ] 提议方无法确认自己的提议(没有按钮;后端也会拒绝)。
- [ ] 另一方确认 → 双方看到 **Scheduled**:带明确时区的时间 + 六行两轮制议程。
- [ ] (可选)取消测试:取消已排定的场次 → 对方收到通知;配对回到"Pick a time";可以重新提议。

## 7 · 双向完成确认 → 共享凭证
- [ ] 排定的开始时间**之前**:确认卡不出现(状态停在"Scheduled")。测试时可把场次约在几分钟后,等开始时间过去。
- [ ] 开始后:双方都看到 **Confirm your session**。A 提交"It happened"——必须勾选**两个**方框(我练了我的一轮 + 我主持了对方的一轮),否则被拦。
- [ ] A 提交后:A 显示"等待 B";B 仍看到确认卡。**此时还没有凭证**(Done 页仍为空)。
- [ ] A 无法重复提交。
- [ ] B 提交"It happened"(两框都勾)→ 状态变为 **Verified ✦**;双方收到"exchange verified"通知。
- [ ] Done 页(两个账号):**恰好一枚**共享凭证——日期相同、练习类型相同、显示对方名字,两边数量一致。
- [ ] (可选,第二场)争议路径:再约一场,一方确认"It happened"、另一方选"Someone didn't show" → 状态变为"Under review",**无凭证**,该记录冻结待你人工处理。

## 8 · 回归检查(关掉开关)
- [ ] 在一台设备关掉开关 → Post 标签回来、Discover 没有 "+"、Practice 标签消失;Discover 滑卡、Matches、已有聊天、Events、普通匹配的身份揭示、发帖,全部与之前一致。
- [ ] 上面创建的 Practice 聊天在 Matches 里仍然存在(它是真实对话)——带徽章,属正常现象。

## 出问题时去哪儿查
- 界面上的友好报错来自 `practiceErrorMessage`;原始错误代号(如 `no_mutual_fit`)显示在浏览器控制台。
- 埋点落在 `funnel_events`(`practice_*` 事件名,均带 `community_id`)。
- 数据库真相:在 SQL Editor 查 `practice_admin_report` 视图,可得每个社区的请求/邀请/配对/场次/凭证计数,与上面每一步交叉核对。
