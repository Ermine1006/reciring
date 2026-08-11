# Phase 1.2 — 统一核心匹配字段（设计草案）

> 2026-08-10 · 设计文档 · 输入来自对当前 `main` 的字段审计

## ✅ 已采纳的决策（2026-08-10）

创始人拍板:**「用旧的 profile,新的(V3)暂时不用」**。因此 1.2 不走"读侧适配器/合并 v2+v3",而是**统一到 legacy v2**:

- 关掉 V3 rollout 开关(`src/lib/featureFlags.js` → `PROFILE_V3_ROLLOUT = false`)——所有人走旧 profile 引导,写 v2 列。
- 三个引擎本来就读 v2 列 → 字段天然一致,V3 隐形 bug 消失。
- V3 的引导/页面代码保留、可一行开关恢复;`localStorage 'mutu_profile_v3'='on'` 仍可单机预览。
- 下面第 1–2 节的"适配器方案"**改期到 Phase 2**(等将来恢复 V3、让引擎读 v3 列时再用),留作记录。

⚠️ **遗留**:此前用 V3 引导注册过的账号(仅 4 个白名单邮箱)v2 列为空,匹配里仍会"隐形",需各自重填一次旧 profile,或做一次性 v3→v2 backfill(见文末 follow-up)。

---

> 以下为原始适配器设计(Phase 2 参考,当前未执行):

## 0. 为什么这步从"整理"升级成"修 bug"

今天上线了 **Profile V3**(功能开关 `isProfileV3Enabled`,白名单邮箱走 V3,其余走 legacy)。现在 `profiles` 表上有**两套并行字段**:

| | 旧(v2)家族 | 新(v3)家族 |
|---|---|---|
| 能帮什么 | `can_help_with` | `expertise_offered` |
| 想要什么帮助 | `skills_to_learn` | `help_wanted` |
| 行业 | `industry_interests` | `industries_known` + `industries_exploring` |
| 一句话头衔 | `headline` | `professional_headline` / `title` |
| 兴趣 | `prompt_ask_me`(自由文本) | `personal_interests`(数组) |
| 活动 | `prompt_weekend`(自由文本) | `activity_preferences`(数组) |

**问题**:V3 引导只写 v3 字段;而三个引擎全读 v2 字段:
- Discover:`AuthContext` 只从 `can_help_with/skills_to_learn/industry_interests` 构建 `viewerProfile` → V3 用户三者皆空 → 退化成 `DEFAULT_VIEWER_PROFILE`。
- Smart Match 边缘函数:`select` 只取 v2 列、`scoreCandidate` 只算 v2 → V3 用户对所有人得分≈0。
- 活动匹配:只读 `event_attendees.need_text/offer_text`(每场活动的自由文本,不碰 profile)——这个不受影响。

**结论**:不统一字段,V3 用户就是"匹配隐形人"。统一字段 = 修这个 bug + 给后面的 Smart Match(1.3)/Event Goal(1.4)一个干净地基。

---

## 1. 标准信号集(Canonical Signals)

定义一套**与存储无关**的规范信号,作为所有引擎的唯一输入契约。取值时用 `v3 ?? v2` 兜底(V3 优先,回落 v2),这样两套引导写的用户都能被读到。

| 规范信号 | 含义 | 取值(优先级 v3 → v2) | 类型 |
|---|---|---|---|
| `offer` | 我能给的帮助 | `expertise_offered` ?? `can_help_with` | string[] |
| `need` | 我想要的帮助 | `help_wanted` ?? `skills_to_learn` | string[] |
| `industries` | 行业标签 | `[...industries_known, ...industries_exploring]` ?? `industry_interests` | string[] |
| `headline` | 一句话头衔 | `professional_headline` ?? `title` ?? `headline` | string |
| `interests` | 个人兴趣 | `personal_interests` ?? tokenize(`prompt_ask_me`) | string[] |
| `activities` | 活动偏好 | `activity_preferences` ?? tokenize(`prompt_weekend`) | string[] |
| `intent` | networking 意图 | `networking_intent` *(v3 未采集 → 缺口)* | string[] |
| `formats` | 互动形式偏好 | `helping_preferences` *(v3 独有)* | string[] |
| `program` | 项目 | `program` | string |
| `careerStage` | 资历 | `career_stage` *(v3 未采集 → 缺口)* | string |
| `gradYear` | 毕业年份 | `graduation_year` | int |

Post / event 侧的对应(供 Discover 卡片打分,不变):`offer↔offer_text`、`need↔need_text`、`offer 分类↔help_type`、`industries↔industry_tag`。

---

## 2. 推荐实现方式:读侧适配器(不做数据迁移)

**做法**:新增一个模块 `src/lib/matchSignals.js`,导出 `matchSignals(profile)` → 返回上表的规范对象(内部做 `v3 ?? v2` 兜底 + 自由文本 tokenize)。三个消费点全部改成读它:
1. `AuthContext` 构建 `viewerProfile` 时用 `matchSignals()`。
2. Smart Match 边缘函数里放一份**镜像实现**(Deno 版,同样 coalesce),`select` 扩展到同时取 v2+v3 列。
3. 活动匹配保持自由文本,不变(可选:把 profile 的 offer/need 作为"没填活动意图时的兜底")。

**为什么选适配器而不是数据迁移**:
- ✅ 零迁移风险、可立刻上线、立刻修好 V3 隐形 bug。
- ✅ 给了一个**唯一的"匹配用哪些字段"真相点**——这正是 1.2 的目标。
- ✅ 对 v2、v3 用户都工作,不用管谁走了哪个引导。
- ⚠️ 代价:边缘函数要维护一份镜像(JS 和 Deno 各一份 coalesce 逻辑)。可接受。

备选(不推荐现在做):**数据迁移/backfill**——把所有人统一写进一套列。更彻底但有迁移风险,且 v2/v3 引导仍在并存,写侧不统一就还会漂移。留到 Phase 2。

---

## 3. 需要你拍板的决策

| # | 决策 | 我的建议 |
|---|---|---|
| A | 未来以哪套为准? | **v3 为规范目标**(它是重设计方向),v2 当 legacy 源;适配器负责兜底 |
| B | 适配器 vs 立刻 backfill? | **只做适配器**,零迁移。backfill 留 Phase 2 |
| C | 行业 known/exploring 要不要分方向? | **先拍平**成一个 `industries` 包(引擎目前不分方向);方向性留后 |
| D | v3 缺 `intent` / `career_stage` 两个信号,怎么办? | **先接受降级**(V3 用户这两个打分桶跳过),记为 follow-up:是否在 V3 引导补采集 |

---

## 4. 改动清单(拍板后执行,预估工作量:中)

1. 新增 `src/lib/matchSignals.js` — 规范适配器(纯函数,可单测)。
2. `src/context/AuthContext.jsx` — `viewerProfile` 改用 `matchSignals()`。
3. `supabase/functions/match-suggestions/index.js` — `PROFILE_FIELDS` 扩列 + 镜像 coalesce。
4. (可选)活动匹配兜底 profile offer/need。
5. 冒烟:V3 用户在 Discover 不再退化默认、Smart Match 能算出非零分。

> 注:这步纯读侧,不需要你在 Supabase 跑迁移(和 1.1 不同)。
