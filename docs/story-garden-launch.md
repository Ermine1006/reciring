# Story Garden v1

个人故事集、作者压花与轻提示的后续升级见 [story-garden-pride.md](story-garden-pride.md)。它需要在原安装脚本之后手动运行 `scripts/migration-story-garden-notebook.sql`。

Together 新增 The Story Garden，保留已选定的花园纸页与翻开手记的体验。学生和校友可以分享工作、MBA、人与人之间的经历，以及仍在摸索的事情。

本次基于 `35b1e680819aa1d526c587bf2ae1e4bf1fac52e3` 构建。代码已接入现有 React / Supabase 项目，通过独立功能分支提交审阅。数据库脚本只在独立 PGlite PostgreSQL 测试环境运行过，未连接 Supabase，未修改线上数据。

## 实现范围

| 入口或行为 | 实际行为 |
| --- | --- |
| Together → For You | 原有两张活动卡片下方新增 Story Garden 入口 |
| 花园 | 社区每次最多四张真实纸页，可按主题漫步，可前进或返回；空花园会展示明确标注的虚构示例，也可主动切换 Community pages / Example pages |
| 阅读 | 点击纸页打开手记；保留作者换行与文字，按纯文本显示 |
| 写作 | 标题可选，正文最多 20,000 字符；固定起笔提示只改变占位文字 |
| Fold & preview my page | 预览原文，选择署名和回应方式，明确社区受众，再主动勾选本人写作承诺 |
| 匿名 | 默认匿名；选择署名时只显示姓名；不会解锁完整资料或创建关系 |
| Just sharing | 默认关闭书面回复，保留两种温和回应；已有回复不因关闭而消失 |
| Open to conversation | 开放书面回复；回复也需要本人写作承诺；作者可重新关闭 |
| My notebook | 云端私人草稿和个人收藏；文章撤回或不可访问后，其他人的收藏中不再展示内容 |
| 回应 | “This stayed with me” 与 “I’ve felt this too”；可撤回，没有公开计数或回应者名单 |
| 编辑和撤回 | 更新已发布文章需再次预览和确认；Take my page back 将文章收回私人手记，隐藏文章和回复 |
| 草稿保护 | 手动保存，只有服务器成功后显示已保存；离开提醒支持继续写、私人保存后离开、放弃修改 |
| 故障恢复 | 网络失败或版本冲突保留当前输入；切换账号清空该组件；返回应用重新检查访问资格 |
| 社区照护 | 私人举报、匿名作者隐藏、清空已隐藏作者；正式指定的 moderator 可以查看举报并移除内容 |

写作承诺为 `I wrote this myself, without AI writing or rewriting.`，每次确认界面默认未勾选。允许基础拼写检查和逐字语音输入。这里没有 AI 起草、润色、自动总结、AI 检测器或按文章内容自动匹配。承诺和人工审核建立社区规范，不能证明一段文字从未使用外部 AI。

## 开启预览

遵循 `AGENTS.md`：**所有 Supabase SQL 均由 founder 手动运行；Git 提交需要 founder 明确提出。**

1. 审阅 `scripts/migration-story-garden.sql`。需要现有的 `profiles`、`communities`、`community_members`、`blocks`。脚本在一个事务内创建故事模块，不改写现有产品数据，不自动指定管理员。
2. 由 founder 在选定的 Supabase 项目 SQL Editor 手动执行整份迁移。
3. 手动运行 `scripts/verify-story-garden.sql`，确认所有新表启用 RLS，`anon` / `authenticated` 无原始表权限，只有 `authenticated` 能执行公开 RPC，私有 helper 不可执行。
4. 按下一节明确指定社区 moderator，再以真实且有资格的学生与校友账号做预览。
5. 在安装了本次代码的浏览器中开启单设备入口并刷新：

```js
localStorage.setItem('mutu_stories', 'on')
location.reload()
```

入口位于 Together 的 For You 页。没有 Supabase 配置、缺少迁移或加载失败时显示实际错误，不用示例掩盖故障。示例仅在社区资格和列表读取成功后显示。

关闭该设备入口：

```js
localStorage.setItem('mutu_stories', 'off')
location.reload()
```

新功能默认开关为 `false`。现有 Together、Home Community Map 等开关值保持不变。这个开关仅控制界面可见性；数据库资格才是权限边界。关闭界面不会撤销已经授予的 RPC 权限，不删除已有故事。

## 虚构人物与示例文章

Founder 要求每个主题各有一个样本，便于看到花园有内容时的阅读效果。四位虚构人物和完整文章保存在 `src/data/storyExamples.js`：

| 主题 | 虚构人物 | 文章 |
|---|---|---|
| At work | Maya，MBA alum | I sent the wrong file |
| MBA moments | Jonah，MBA student | The question I didn’t ask |
| Between people | Leila，MBA student | An ordinary coffee chat |
| Still becoming | Rin，MBA alum | Still figuring it out |

- 社区当前主题的第一页为空时，先展示该主题的示例；有真实文章时优先展示社区文章。Community pages 和 Example pages 允许随时选择，社区分页不会混入样例。
- 每张纸笺和全文均标注 `Fictional example`，人物署名标注 `Fictional writer`。它们是为 demo 创作的内容，没有真人投稿、本人口述或不用 AI 写作的声明。
- 点击纸笺展开全文；Every corner 中可用 `Another example` 看下一篇。`Begin my own page` 打开空白编辑器，发布仍需主动勾选本人写作承诺。成功发表后切回 Community pages。
- 示例使用独立只读阅读组件，没有回复、收藏、举报、隐藏作者或文章编辑操作，不创建 Auth 用户、profile、社区成员或数据库故事记录，不产生互动数量或匹配资料。无需新增 SQL。
- 真实草稿、收藏、匿名性、社区资格、错误恢复和退出保护沿用现有流程。失去资格时示例入口也会隐藏。

本次小改动的 UX 目标是帮助读者理解“可以不完美地写”，降低空白页压力。沿用 curiosity、agency、ease 三个动机视角：主题纸笺 → 展开一篇 → 理解分享尺度 → 自愿从空白开始 → 返回自己的手记。层级是花园说明、内容来源与主题、纸笺、主要写作动作；抹茶与奶白视觉、有限翻页和 reduced-motion 行为延续原有设计。成功看用户是否能分辨样例、找到适合自己的主题并保留自己的表达，不以假活跃或浏览时长衡量。空社区可选择样例，加载与错误仍真实呈现，发表完成才显示保存成功。实现仅涉及前端示例、阅读分支、样式和相应说明与验证；数据库权限、rollout 默认值、Together 其他模块和真人写作规范保持现有行为。

## 指定 moderator

不要从前端管理员 email 列表或用户可编辑的 `member_type` 派生此权限。迁移默认没有 moderator。

Founder 先核对目标账号的 Auth 用户 ID，例如在 SQL Editor 中手动查询：

```sql
SELECT u.id, u.email, u.email_confirmed_at, p.name, p.access_status
FROM auth.users u
JOIN public.profiles p ON p.id=u.id
WHERE lower(u.email)=lower('REPLACE_WITH_CONFIRMED_MODERATOR_EMAIL');
```

确认是预期账号后，替换下方 UUID，再手动指定其所属社区的权限。目标账号必须已经是 active member：

```sql
INSERT INTO public.story_moderators(community_id,user_id)
SELECT c.id,p.id
FROM public.communities c
JOIN public.profiles p ON p.id='REPLACE_WITH_VERIFIED_AUTH_USER_UUID'::uuid
JOIN public.community_members m ON m.community_id=c.id AND m.user_id=p.id
WHERE c.slug='rotman' AND p.access_status='active' AND m.status='member'
ON CONFLICT DO NOTHING
RETURNING community_id,user_id;
```

Moderator 会在花园看到 Community care。举报保留提交当时的内容快照；只有该社区指定 moderator 可见作者的姓名和 email。移除作用于当前文章或回复，并阻止作者再次发布该条内容。对于本人写作承诺的疑虑，需要人工看上下文；不会自动判定使用 AI。

## 数据和权限

- 新表：`stories`、`story_bookmarks`、`story_reactions`、`story_replies`、`story_mutes`、`story_reports`、`story_moderators`。
- 所有新表均启用 RLS 且不给普通客户端原始表访问权限。客户端只调用设定固定 `search_path` 的公开 RPC；RPC 显式投影允许显示的字段。
- 资格沿用 `profiles.access_status='active'` 和 `community_members.status='member'`，不依赖 mock interview request 或学生/校友标签。
- 普通读取不返回作者 UUID、email、头像、举报者 ID 或回应者列表。署名读取只增加作者姓名。匿名文章的作者即使选择署名回复，也显示为 Story author。
- 草稿、撤回内容仅本人可读。作者失去社区资格后，其公开文章和回复也停止向社区展示。收藏和回应删除接口允许本人清理已有记录，即使其访问资格已失效。
- 现有 `blocks` 双向生效。花园隐藏作者使用独立私有 `story_mutes`，不向客户端返回 writer ID，不写入可被 blocker 查询的账号拉黑表。隐藏在花园内双向生效；清空隐藏不会删除账号拉黑。
- 署名本身、故事细节和多篇文章的内容仍可能让读者认出作者。匿名不会限制受信任团队在举报处理时核对作者。
- 故事和回复使用客户端生成 UUID 与乐观版本号。相同请求的重试返回相同结果；旧版本的不同内容不能覆盖已保存版本。回复写入与作者关闭回复或撤回共享父文章行锁。
- 草稿和未发送回复保存在当前组件内存，成功保存才进入数据库；不将正文写入 localStorage、分析日志或 AI 输入。浏览器关闭提示并不能保证系统强制结束进程时保住尚未保存的文字。
- v1 提供文章撤回与回复删除，没有永久删除已保存文章的用户界面。举报快照保留以供审核；账号删除沿用现有 profiles 级联规则。

## 验证

虚构示例更新：StoriesHub 的 19 项交互测试通过，生产构建通过。覆盖每个主题的示例、阅读切换、从空白开始写作，以及示例不调用真实故事的写入接口。本轮未进行浏览器或真机视觉验收。

本轮检查结果：15 个测试文件、324 项测试全部通过，其中 44 项覆盖故事模块；完整生产构建通过。`git diff --check` 无空白错误。现有依赖版本未升级，新增的三个包仅用于开发测试。

使用 Node 24，按锁文件安装依赖：

```sh
npm ci
npm test
npm run build
```

只检查该功能：

```sh
npm test -- src/lib/__tests__/stories.database.test.js src/lib/__tests__/stories.test.js src/components/stories/__tests__/StoriesHub.test.jsx
```

PGlite 是独立 PostgreSQL 引擎；测试创建 Supabase 的 `auth.uid()` 和角色契约，加载本次完整 SQL，在真实数据库权限下验证 24 个访问与生命周期场景。它不读取项目环境变量、不连接 Supabase。另有客户端 RPC 与 React DOM 测试，覆盖保存失败、原文保留、实际导航保护、匿名默认值、书面回复关闭、账号切换和访问失效。

实际 Supabase / PostgREST 集成、浏览器视觉和真机验收尚未执行。发布前需要检查：手机 320/390px 的纸页和长文、中文/英文长标题、键盘与底部导航、键盘焦点和原生确认框、减少动态效果设置，以及两名不同账号之间的保存、读取、撤回、屏蔽和举报。自动化 DOM 测试不等同于这些视觉或设备检查。

## Behavioral UX review

兼容性：项目当前最低 iOS 版本为 15.0。原生 dialog 在 [Safari 15.4 中加入](https://webkit.org/blog/12445/new-webkit-features-in-safari-15-4/)，因此确认框包含旧版 WebView 的焦点限制与可访问性回退，不提高最低系统版本。

用户的工作是用自己的话留下经历，情绪障碍是担心“不够成功”或表达不够好。花园纸页与手记把入口变得轻松，避免公开绩效感。

本次采用三个动机视角：curiosity 用真实纸页和展开动作带来探索；ownership 让私人手记保留有价值的文字；agency 让匿名、回应、编辑、撤回与隐藏都由本人决定。其余视角已审阅，不加入排名、勋章、稀缺奖励或强制分享。降低操作负担通过可选标题、少量设置和固定提示完成，遵循用户“不用 AI 写作”的约束。

交互顺序：花园入口 → 展开一页或写自己的页 → 原文预览与明确同意 → 文章真实保存 → 私人手记提供自然返回理由。层级为一句价值说明、可展开的纸页、一个主要写作动作；照护功能收在次要位置。成功文案是 “Your words have a place here.”，不会立即要求继续发表。

视觉使用奶白纸张、抹茶主操作、少量暖金和静态植物。短暂翻页、按花与放信封动作反馈真实操作；`prefers-reduced-motion` 会关闭动画。花园永不随活跃度枯萎，不模拟陌生人的在线状态。

空状态邀请留下一个小片段；加载状态说明正在打开；失败不伪装成功；完成后允许安静离开。每项选择说明实际受众和后果，不预选写作承诺，不使用羞辱式零状态或冲动提醒。

成功应从自愿分享后的安心感、真实收到帮助/共鸣、保存文字的后续价值，以及在成员明确同意下形成的有用互动判断。本版本不采集正文或新增增长埋点，不把原始停留时间作为目标。Mutu 的 North Star 仍是完成且双方验证的交换；文章和回应不铸造 Token，不增强 Community Map 边，也不强制导向约见。

实施边界：新组件、新 RPC 和独立默认关闭的入口。既有 matching、Career Focus taxonomy、`practice_*` 工作流、Ask Mutu、Token/reputation 和社区关系授权规则保持原有行为。主题词只是文章内容分区，不是职业分类。

最终质量检查：主要动作明确；写作价值先于输入要求；回应自愿且可撤回；完成反馈只在数据库成功后出现；尊重匿名与社区资格；私人手记提供返回价值。这里为信任和后续自愿互动提供空间，不声称发表文章本身完成了一次已验证的交换。
